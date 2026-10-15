/**
 * TMAP iOS 지도 어댑터. React props를 SDK 카메라·마커·선으로 변환하고 정착 이벤트를 JS로 전달한다.
 * 정류장 조회나 도착 알림 규칙은 포함하지 않는다. Swift 파일은 JSDoc 대신 같은 형태의 문서 주석을 사용한다.
 */
import ExpoModulesCore
import TMapSDK
import VSMSDK
import UIKit
import CoreLocation

/** JS에서 사용할 뷰 이름·이벤트·props 계약을 등록한다. */
public class TaragoTmapModule: Module {
  /** 네이티브 지도 뷰의 입력과 콜백을 Expo 모듈에 연결한다. */
  public func definition() -> ModuleDefinition {
    Name("TaragoTmap")
    View(TaragoTmapView.self) {
      Events("onReady", "onCameraIdle", "onMarkerPress", "onError")
      OnViewDidUpdateProps { (view: TaragoTmapView) in view.flushCamera() }
      Prop("initialCamera") { (view, value: [String: Any]) in view.initialCamera(value) }
      Prop("camera") { (view, value: [String: Any]?) in if let value { view.camera(value) } }
      Prop("markers") { (view, value: [[String: Any]]) in view.setMarkers(value) }
      Prop("lines") { (view, value: [[String: Any]]) in view.setLines(value) }
      Prop("position") { (view, value: [String: Any]?) in view.setPosition(value) }
      Prop("padding") { (view, value: [String: Any]) in view.padding = value }
    }
  }
}

/** 지도 렌더링과 제스처는 SDK가 처리하고, 움직임이 정착한 범위만 React로 전달한다. */
final class TaragoTmapView: ExpoView, TMapViewDelegate {
  let onReady = EventDispatcher()
  let onCameraIdle = EventDispatcher()
  let onMarkerPress = EventDispatcher()
  let onError = EventDispatcher()
  private let map = TMapView(frame: .zero)
  private var ready = false
  private var positionData: [String: Any]?
  private var initial: [String: Any]?
  private var didApplyInitialCamera = false
  private var pendingCamera: [String: Any]?
  private var markerData: [[String: Any]] = []
  private var markers: [String: TMapMarker] = [:]
  private var captions: [String: TMapText] = [:]
  private var lines: [TMapPolyline] = []
  private var lineSignature = ""
  private var lineData: [[String: Any]] = []
  private var locationMarker: TMapMarker?
  private var idleWork: DispatchWorkItem?
  private var imageCache: [String: UIImage] = [:]
  private var markerSignatures: [String: String] = [:]
  var padding: [String: Any] = [:]

  /** 지도 인스턴스를 생성하고 빌드 설정에 들어 있는 SDK 키로 인증한다. */
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    map.delegate = self
    map.isTiltEnable = false
    map.isShowCompass = false
    addSubview(map)
    if let key = Bundle.main.object(forInfoDictionaryKey: "TMapAppKey") as? String, !key.isEmpty {
      map.setApiKey(key)
    }
  }
  /** 뷰 크기가 결정되면 카메라를 적용하고 지도 키 누락을 알린다. */
  override func layoutSubviews() {
    super.layoutSubviews()
    map.frame = bounds
    flushCamera()
    if Bundle.main.object(forInfoDictionaryKey: "TMapAppKey") == nil {
      onError(["message": "TMAP_API_KEY is missing from the native build."])
    }
  }
  /** 초기 카메라는 최초 입력만 보관해 React 재렌더가 사용자 이동을 되돌리지 않게 한다. */
  func initialCamera(_ value: [String: Any]) { if initial == nil { initial = value } }
  /** 다음 카메라 명령을 보관하고 전체 props 반영 시점에 실행하도록 지연한다. */
  func camera(_ value: [String: Any]) { pendingCamera = value }
  /** 같은 React 업데이트의 카메라와 시트 여백 props가 모두 전달된 뒤 함께 적용한다. */
  func flushCamera() {
    guard ready, bounds.width > 0, bounds.height > 0,
      let value = pendingCamera ?? (didApplyInitialCamera ? nil : initial) else { return }
    pendingCamera = nil
    didApplyInitialCamera = true
    if let b = value["bounds"] as? [String: Any] {
      map.vsmMapView?.screenCenter = CGPoint(x:0.5,y:0.5)
      map.fitBounds(MapBounds(sw: coordinate(b, lat: "south", lng: "west"), ne: coordinate(b, lat: "north", lng: "east")), inset: UIEdgeInsets(top: number(padding,"top"), left: number(padding,"left"), bottom: number(padding,"bottom"), right: number(padding,"right")))
    } else {
      let point = coordinate(value)
      let target = VSMMapPoint(longitude:point.longitude,latitude:point.latitude)
      let duration = UInt32(max(0,number(value,"duration")))
      let animation = VSMAnimationInfoMake(duration > 0 ? .easeOutCubic : .none,duration)
      // 네이티브 화면 기준점을 조정해 선택 좌표가 시트 위의 보이는 영역에 놓이도록 한다.
      map.vsmMapView?.screenCenter = CGPoint(x:(bounds.width+number(padding,"left")-number(padding,"right"))/(2*bounds.width),y:max(0.05,min(0.95,(bounds.height+number(padding,"top")-number(padding,"bottom"))/(2*bounds.height))))
      let update = VSMCameraUpdate(center:target,zoom:number(value,"zoom",Double(map.getZoom() ?? 17)),animation:animation)
      map.vsmMapView?.moveCamera(update)
    }
    scheduleIdle()
  }
  /** 마커의 변경 서명을 비교해 달라진 항목만 재생성한다. 이미지 로딩이 늦게 끝나도 최신 서명에만 적용한다. */
  func setMarkers(_ value: [[String: Any]]) {
    markerData = value
    guard ready else { return }
    let ids = Set(value.compactMap { $0["id"] as? String })
    for id in Array(markers.keys) where !ids.contains(id) { markers.removeValue(forKey:id)?.map = nil; markerSignatures.removeValue(forKey:id); captions.removeValue(forKey:id)?.map = nil }
    for item in value {
      guard let id = item["id"] as? String else { continue }
      let signature = String(data:(try? JSONSerialization.data(withJSONObject:item,options:.sortedKeys)) ?? Data(),encoding:.utf8) ?? ""
      if markerSignatures[id] == signature { continue }
      markers[id]?.map = nil
      captions.removeValue(forKey:id)?.map = nil
      markerSignatures[id] = signature
      let marker = TMapMarker(position: coordinate(item))
      if let caption = item["caption"] as? String, !caption.isEmpty {
        let text = TMapText(position:coordinate(item),text:caption)
        text.fontSize = 12; text.fontWeight = 600; text.fontColor = .darkGray
        text.backgroundColor = .white; text.offset = CGSize(width:0,height:18)
        text.map = map; captions[id] = text
      }
      marker.rotation = (item["rotation"] as? NSNumber)?.floatValue
      /** TMAP은 이미지 크기로 offset을 나누어 앵커를 계산하므로 실제 표시 크기에 맞춘다. */
      marker.offset = CGSize(width: number(item,"width") * anchor(item,"x",0.5), height: number(item,"height") * anchor(item,"y",1))
      marker.setTapCallback { [weak self] _ in self?.onMarkerPress(["id":id]) }
      markers[id] = marker
      if item["kind"] as? String == "place" {
        marker.icon = placeIcon()
        marker.isUseImage = true
        marker.offset = CGSize(width:16,height:40)
        marker.map = map
      }
      if let uri = item["imageUri"] as? String, let url = URL(string: uri) {
        let cacheKey = "\(uri)|\(number(item,"width"))|\(number(item,"height"))"
        if let image = imageCache[cacheKey] { marker.icon = image; marker.isUseImage = true; marker.map = map }
        else {
          let apply: (Data?, Error?) -> Void = { [weak self] data, error in
            guard let data, let image = UIImage(data:data) else { DispatchQueue.main.async { self?.onError(["message":error?.localizedDescription ?? "Cannot load TMAP marker image."]) }; return }
            DispatchQueue.main.async {
              guard let self, self.markerSignatures[id] == signature else { return }
              let size = CGSize(width:max(1,self.number(item,"width")),height:max(1,self.number(item,"height")))
              let scaled = UIGraphicsImageRenderer(size:size).image { _ in image.draw(in:CGRect(origin:.zero,size:size)) }
              self.imageCache[cacheKey] = scaled
              marker.map = nil; marker.icon = scaled; marker.isUseImage = true; marker.map = self.map; self.updateVisibility()
            }
          }
          if url.scheme == nil {
            let path = uri.removingPercentEncoding ?? uri
            DispatchQueue.global(qos:.userInitiated).async {
              let image = UIImage(contentsOfFile:path) ?? UIImage(contentsOfFile:Bundle.main.bundlePath+"/"+path) ?? UIImage(named:path)
              apply(image?.pngData(),image == nil ? NSError(domain:"TaragoTmap",code:1,userInfo:[NSLocalizedDescriptionKey:"Cannot load bundled TMAP marker image."]) : nil)
            }
          } else if url.isFileURL { DispatchQueue.global(qos:.userInitiated).async { do { apply(try Data(contentsOf:url),nil) } catch { apply(nil,error) } } }
          else { URLSession.shared.dataTask(with:url) { data, _, error in apply(data,error) }.resume() }
        }
      }
    }
    updateVisibility()
  }
  /** 선 좌표의 직렬화 결과가 달라질 때만 네이티브 폴리라인을 교체한다. */
  func setLines(_ value: [[String: Any]]) {
    lineData = value
    guard ready else { return }
    let signature = String(data:(try? JSONSerialization.data(withJSONObject:value,options:.sortedKeys)) ?? Data(),encoding:.utf8) ?? ""
    if signature == lineSignature { return }; lineSignature = signature
    lines.forEach { $0.map = nil }; lines.removeAll()
    for item in value {
      let points = (item["points"] as? [[String:Any]] ?? []).map { coordinate($0) }
      guard points.count > 1 else { continue }
      let line = TMapPolyline(coordinates:points)
      line.strokeWidth = number(item,"width",3)
      line.strokeColor = color(item["color"] as? String ?? "#1976D2")
      line.map = map; lines.append(line)
    }
  }
  /** 유효한 현재 좌표를 고정 크기의 파란 위치 점으로 표시하고 이전 점은 제거한다. */
  func setPosition(_ value: [String: Any]?) {
    positionData = value
    guard ready else { return }
    locationMarker?.map = nil; locationMarker = nil
    guard let value else { return }
    let marker = TMapMarker(position:coordinate(value))
    marker.offset = CGSize(width:9,height:9)
    marker.icon = UIGraphicsImageRenderer(size:CGSize(width:18,height:18)).image { _ in
      UIColor.white.setFill(); UIBezierPath(ovalIn:CGRect(x:0,y:0,width:18,height:18)).fill()
      UIColor.systemBlue.setFill(); UIBezierPath(ovalIn:CGRect(x:3,y:3,width:12,height:12)).fill()
    }
    marker.isUseImage = true; marker.map = map; locationMarker = marker
  }
  /** 지도 준비 후 보관한 카메라·마커·선·위치를 적용하고 준비 완료를 전달한다. */
  func mapViewDidFinishLoadingMap() {
    guard !ready else { return }; ready = true
    flushCamera()
    setMarkers(markerData); setLines(lineData); setPosition(positionData); onReady([:]); scheduleIdle()
  }
  /** SDK 인증 실패를 React 화면으로 전달한다. */
  func SKTMapApikeyFailed(error: NSError?) { onError(["message":error?.localizedDescription ?? "TMAP SDK authentication failed."]) }
  /** 지도 범위 변경은 즉시 서버 호출하지 않고 정착 이벤트 예약으로 넘긴다. */
  func mapViewDidChangeBounds() { scheduleIdle() }
  /** 줌 변경도 동일한 정착 이벤트로 합친다. */
  func mapView(_ mapView: TMapView, viewLevelChanged zoom: Int) { scheduleIdle() }
  /** 150ms 동안 이어지는 이동 이벤트를 하나로 합쳐 최종 범위와 줌만 전달한다. */
  private func scheduleIdle() {
    idleWork?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self, let b = self.map.getMapBounds() else { return }
      self.updateVisibility()
      self.onCameraIdle(["region":["latitude":b.getBottom(),"longitude":b.getLeft(),"latitudeDelta":b.getTop()-b.getBottom(),"longitudeDelta":b.getRight()-b.getLeft()],"zoom":self.map.getZoom() ?? 15])
    }
    idleWork = work; DispatchQueue.main.asyncAfter(deadline:.now()+0.15,execute:work)
  }
  /** 줌과 이미지 준비 여부에 맞춰 마커·라벨 노출을 조절한다. */
  private func updateVisibility() {
    let zoom = Double(map.getZoom() ?? 15)
    for item in markerData { if let id = item["id"] as? String, let marker = markers[id] { let visible = zoom >= number(item,"minZoom") && (item["imageUri"] == nil || marker.icon != nil); if visible && marker.map == nil { marker.map = map }; if !visible && marker.map != nil { marker.map = nil }; let captionVisible = visible && zoom >= number(item,"captionMinZoom",18); if captionVisible && captions[id]?.map == nil { captions[id]?.map = map }; if !captionVisible { captions[id]?.map = nil } } }
  }
  /** 일반 검색 장소의 핀 이미지를 로컬 벡터 경로로 그린다. */
  private func placeIcon() -> UIImage {
    UIGraphicsImageRenderer(size:CGSize(width:32,height:40)).image { _ in
      let pin = UIBezierPath()
      pin.move(to:CGPoint(x:16,y:40)); pin.addCurve(to:CGPoint(x:2,y:14),controlPoint1:CGPoint(x:6,y:26),controlPoint2:CGPoint(x:2,y:22))
      pin.addArc(withCenter:CGPoint(x:16,y:14),radius:14,startAngle:.pi,endAngle:0,clockwise:true)
      pin.addCurve(to:CGPoint(x:16,y:40),controlPoint1:CGPoint(x:30,y:22),controlPoint2:CGPoint(x:26,y:26))
      UIColor.systemBlue.setFill(); pin.fill()
      UIColor.white.setFill(); UIBezierPath(ovalIn:CGRect(x:10,y:8,width:12,height:12)).fill()
    }
  }
  /** JS 숫자 필드를 Double로 읽고 값이 없으면 지정된 기본값을 사용한다. */
  private func number(_ item:[String:Any],_ key:String,_ fallback:Double = 0)->Double { (item[key] as? NSNumber)?.doubleValue ?? fallback }
  /** 중첩된 anchor 객체에서 정규화 기준점을 읽는다. */
  private func anchor(_ item:[String:Any],_ key:String,_ fallback:Double)->Double { number(item["anchor"] as? [String:Any] ?? [:],key,fallback) }
  /** React 좌표 필드를 SDK의 위도·경도 타입으로 변환한다. */
  private func coordinate(_ item:[String:Any],lat:String = "latitude",lng:String = "longitude")->CLLocationCoordinate2D { CLLocationCoordinate2D(latitude:number(item,lat,number(item,"lat")),longitude:number(item,lng,number(item,"lng"))) }
  /** React의 RGB HEX 문자열을 UIKit 색상으로 변환한다. */
  private func color(_ hex:String)->UIColor { let v=UInt64(hex.trimmingCharacters(in:CharacterSet(charactersIn:"#")),radix:16) ?? 0x1976D2; return UIColor(red:CGFloat((v>>16)&255)/255,green:CGFloat((v>>8)&255)/255,blue:CGFloat(v&255)/255,alpha:1) }
}
