import ExpoModulesCore
import TMapSDK
import VSMSDK
import UIKit
import CoreLocation

public class TaragoTmapModule: Module {
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

/** SDK owns rendering and gestures; only settled camera state crosses the JS boundary. */
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
  override func layoutSubviews() {
    super.layoutSubviews()
    map.frame = bounds
    flushCamera()
    if Bundle.main.object(forInfoDictionaryKey: "TMapAppKey") == nil {
      onError(["message": "TMAP_API_KEY is missing from the native build."])
    }
  }
  func initialCamera(_ value: [String: Any]) { if initial == nil { initial = value } }
  func camera(_ value: [String: Any]) { pendingCamera = value }
  /** Apply camera and padding together after React has delivered every prop in this update. */
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
      // The native normalized anchor keeps the requested GPS coordinate above a covering sheet.
      map.vsmMapView?.screenCenter = CGPoint(x:(bounds.width+number(padding,"left")-number(padding,"right"))/(2*bounds.width),y:max(0.05,min(0.95,(bounds.height+number(padding,"top")-number(padding,"bottom"))/(2*bounds.height))))
      let update = VSMCameraUpdate(center:target,zoom:number(value,"zoom",Double(map.getZoom() ?? 17)),animation:animation)
      map.vsmMapView?.moveCamera(update)
    }
    scheduleIdle()
  }
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
      /** TMAP divides offset by UIImage.size to obtain the icon's normalized anchor. */
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
  func mapViewDidFinishLoadingMap() {
    guard !ready else { return }; ready = true
    flushCamera()
    setMarkers(markerData); setLines(lineData); setPosition(positionData); onReady([:]); scheduleIdle()
  }
  func SKTMapApikeyFailed(error: NSError?) { onError(["message":error?.localizedDescription ?? "TMAP SDK authentication failed."]) }
  func mapViewDidChangeBounds() { scheduleIdle() }
  func mapView(_ mapView: TMapView, viewLevelChanged zoom: Int) { scheduleIdle() }
  private func scheduleIdle() {
    idleWork?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self, let b = self.map.getMapBounds() else { return }
      self.updateVisibility()
      self.onCameraIdle(["region":["latitude":b.getBottom(),"longitude":b.getLeft(),"latitudeDelta":b.getTop()-b.getBottom(),"longitudeDelta":b.getRight()-b.getLeft()],"zoom":self.map.getZoom() ?? 15])
    }
    idleWork = work; DispatchQueue.main.asyncAfter(deadline:.now()+0.15,execute:work)
  }
  private func updateVisibility() {
    let zoom = Double(map.getZoom() ?? 15)
    for item in markerData { if let id = item["id"] as? String, let marker = markers[id] { let visible = zoom >= number(item,"minZoom") && (item["imageUri"] == nil || marker.icon != nil); if visible && marker.map == nil { marker.map = map }; if !visible && marker.map != nil { marker.map = nil }; let captionVisible = visible && zoom >= number(item,"captionMinZoom",18); if captionVisible && captions[id]?.map == nil { captions[id]?.map = map }; if !captionVisible { captions[id]?.map = nil } } }
  }
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
  private func number(_ item:[String:Any],_ key:String,_ fallback:Double = 0)->Double { (item[key] as? NSNumber)?.doubleValue ?? fallback }
  private func anchor(_ item:[String:Any],_ key:String,_ fallback:Double)->Double { number(item["anchor"] as? [String:Any] ?? [:],key,fallback) }
  private func coordinate(_ item:[String:Any],lat:String = "latitude",lng:String = "longitude")->CLLocationCoordinate2D { CLLocationCoordinate2D(latitude:number(item,lat,number(item,"lat")),longitude:number(item,lng,number(item,"lng"))) }
  private func color(_ hex:String)->UIColor { let v=UInt64(hex.trimmingCharacters(in:CharacterSet(charactersIn:"#")),radix:16) ?? 0x1976D2; return UIColor(red:CGFloat((v>>16)&255)/255,green:CGFloat((v>>8)&255)/255,blue:CGFloat(v&255)/255,alpha:1) }
}
