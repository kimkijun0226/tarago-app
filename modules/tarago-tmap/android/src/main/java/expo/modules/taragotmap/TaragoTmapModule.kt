package expo.modules.taragotmap

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.Point
import com.skt.tmap.vsm.map.VSMMapView
import com.skt.tmap.vsm.data.VSMMapPoint
import com.skt.tmap.vsm.camera.CameraPosition
import com.skt.tmap.vsm.camera.CameraUpdateFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.skt.tmap.*
import com.skt.tmap.overlay.*
import com.skt.tmap.poi.TMapPOIItem
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher
import java.net.URL
import java.util.concurrent.Executors

class TaragoTmapModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TaragoTmap")
    View(TaragoTmapView::class) {
      Events("onReady", "onCameraIdle", "onMarkerPress", "onError")
      OnViewDestroys { view: TaragoTmapView -> view.destroy() }
      OnViewDidUpdateProps { view: TaragoTmapView -> view.flushCamera() }
      Prop("initialCamera") { view: TaragoTmapView, value: Map<String, Any> -> view.initialCamera(value) }
      Prop("camera") { view: TaragoTmapView, value: Map<String, Any>? -> value?.let(view::camera) }
      Prop("markers") { view: TaragoTmapView, value: List<Map<String, Any>> -> view.setMarkers(value) }
      Prop("lines") { view: TaragoTmapView, value: List<Map<String, Any>> -> view.setLines(value) }
      Prop("position") { view: TaragoTmapView, value: Map<String, Any>? -> view.setPosition(value) }
      Prop("padding") { view: TaragoTmapView, value: Map<String, Any> -> view.padding = value }
    }
  }
}

/** The native SDK renders every frame; camera events are debounced before crossing to JS. */
class TaragoTmapView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  /** The SDK adds a GL child after configuration loads; Yoga must allow its native layout. */
  override val shouldUseAndroidLayout = true
  private val onReady by EventDispatcher()
  private val onCameraIdle by EventDispatcher()
  private val onMarkerPress by EventDispatcher()
  private val onError by EventDispatcher()
  private val map = TMapView(context)
  private val handler = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()
  private val images = android.util.LruCache<String, Bitmap>(100)
  private var ready = false
  private var positionData: Map<String, Any>? = null
  private var initial: Map<String, Any>? = null
  private var didApplyInitialCamera = false
  private var pending: Map<String, Any>? = null
  private var markerData = emptyList<Map<String, Any>>()
  private var lineSignature = ""
  private var lineData = emptyList<Map<String, Any>>()
  private val signatures = mutableMapOf<String, String>()
  var padding = emptyMap<String, Any>()
  private val idle = Runnable {
    if (ready) {
      updateVisibility()
      val bounds = map.bounds
      val sw = bounds.southWest; val ne = bounds.northEast
      onCameraIdle(mapOf("region" to mapOf("latitude" to sw.latitude, "longitude" to sw.longitude, "latitudeDelta" to ne.latitude - sw.latitude, "longitudeDelta" to ne.longitude - sw.longitude), "zoom" to map.zoomLevel))
    }
  }
  init {
    addView(map, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    map.setFPS(60)
    map.setTiltEnable(false)
    map.setOnMapReadyListener {
      ready = true
      flushCamera()
      setMarkers(markerData); setLines(lineData); setPosition(positionData)
      onReady(emptyMap<String, Any>()); scheduleIdle()
    }
    map.setOnPanChangedListener { scheduleIdle() }
    map.setOnZoomChangedListener { scheduleIdle() }
    map.setOnApiKeyListenerCallback(object : TMapView.OnApiKeyListenerCallback {
      override fun onSKTMapApikeySucceed() {}
      override fun onSKTMapApikeyFailed(message: String?) { onError(mapOf("message" to (message ?: "TMAP authentication failed"))) }
    })
    map.setOnClickListenerCallback(object : TMapView.OnClickListenerCallback {
      override fun onPressDown(markers: ArrayList<TMapMarkerItem>?, pois: ArrayList<TMapPOIItem>?, point: TMapPoint?, screen: PointF?) {}
      override fun onPressUp(markers: ArrayList<TMapMarkerItem>?, pois: ArrayList<TMapPOIItem>?, point: TMapPoint?, screen: PointF?) {
        markers?.firstOrNull { it.id != "__tarago_location" }?.let { onMarkerPress(mapOf("id" to it.id)) }
      }
    })
    val metadata = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData
    val key = metadata?.getString("cloud.tarago.tmap.APP_KEY")
    if (!key.isNullOrBlank()) map.setSKTMapApiKey(key)
    else handler.post { onError(mapOf("message" to "TMAP_API_KEY is missing from the native build.")) }
  }
  fun initialCamera(value: Map<String, Any>) { if (initial == null) initial = value }
  fun camera(value: Map<String, Any>) { pending = value }
  /** Apply target and native screen anchor together once all React props are available. */
  fun flushCamera() {
    if (!ready || map.width <= 0 || map.height <= 0) return
    val value = pending ?: if (!didApplyInitialCamera) initial else null
    if (value == null) return
    pending = null; didApplyInitialCamera = true
    @Suppress("UNCHECKED_CAST") val bounds = value["bounds"] as? Map<String, Any>
    if (bounds != null) {
      (0 until map.childCount).map { map.getChildAt(it) }.filterIsInstance<VSMMapView>().firstOrNull()?.mapEngine()?.setScreenCenter(Point(map.width/2,map.height/2))
      map.fitBounds(TMapBounds(TMapPoint(num(bounds,"south"),num(bounds,"west")),TMapPoint(num(bounds,"north"),num(bounds,"east"))),TMapInsets(px(padding,"left"),px(padding,"top"),px(padding,"right"),px(padding,"bottom")))
    } else {
      val target = point(value)
      val sdkView = (0 until map.childCount).map { map.getChildAt(it) }.filterIsInstance<VSMMapView>().firstOrNull()
      val engine = sdkView?.mapEngine()
      if (engine != null) {
        engine.setScreenCenter(Point((map.width+px(padding,"left")-px(padding,"right"))/2,((map.height+px(padding,"top")-px(padding,"bottom"))/2).coerceIn(1,map.height-1)))
        val current = engine.cameraPosition
        val update = CameraUpdateFactory.newCameraPosition(CameraPosition(VSMMapPoint(target.longitude,target.latitude),num(value,"zoom",current.zoom),current.tilt,current.bearing))
        val duration = num(value,"duration").toInt().coerceAtLeast(0)
        if (duration > 0) engine.animateCamera(update,duration) else engine.moveCamera(update)
      } else {
        (value["zoom"] as? Number)?.let { map.setZoomLevel(it.toInt()) }
        map.setCenterPoint(target.latitude,target.longitude,num(value,"duration") > 0)
      }
    }
    scheduleIdle()
  }
  fun setMarkers(value: List<Map<String, Any>>) {
    markerData = value
    if (!ready) return
    val ids = value.mapNotNull { it["id"] as? String }.toSet()
    for (id in signatures.keys.toList()) if (id !in ids) { map.removeTMapMarkerItem(id); signatures.remove(id) }
    for (item in value) {
      val id = item["id"] as? String ?: continue
      val signature = item.toString()
      if (signatures[id] == signature) continue
      map.removeTMapMarkerItem(id)
      signatures[id] = signature
      val marker = TMapMarkerItem()
      marker.setId(id); marker.setTMapPoint(point(item)); marker.setName(item["caption"] as? String ?: "")
      @Suppress("UNCHECKED_CAST") val anchor = item["anchor"] as? Map<String, Any> ?: emptyMap()
      marker.setPosition(num(anchor,"x",0.5).toFloat(), num(anchor,"y",1.0).toFloat())
      if (item["kind"] == "place") { marker.setIcon(placeIcon()); marker.setPosition(0.5f,1f) }
      val uri = item["imageUri"] as? String
      if (uri != null) {
        val cacheKey = "$uri|${item["width"]}|${item["height"]}|${item["rotation"]}|${item["caption"]}"
        val cached = images.get(cacheKey)
        if (cached != null) { marker.setIcon(cached); marker.setPosition(num(anchor,"x",0.5).toFloat(),(num(anchor,"y",1.0)*px(item,"height")/cached.height).toFloat()) }
        else executor.execute {
          try {
            val parsed = Uri.parse(uri)
            val raw = when (parsed.scheme) {
              null -> BitmapFactory.decodeResource(resources, resources.getIdentifier(uri.replace('-','_'),"drawable",context.packageName))
              "content" -> context.contentResolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it) }
              "file" -> BitmapFactory.decodeFile(parsed.path)
              "http", "https" -> URL(uri).openStream().use { BitmapFactory.decodeStream(it) }
              else -> throw IllegalArgumentException("Unsupported marker image URI")
            } ?: throw IllegalArgumentException("Marker image cannot be decoded")
            val scaled = Bitmap.createScaledBitmap(raw,px(item,"width").coerceAtLeast(1),px(item,"height").coerceAtLeast(1),true)
            val rotation = num(item,"rotation").toFloat()
            val rotated = if (rotation == 0f) scaled else Bitmap.createBitmap(scaled,0,0,scaled.width,scaled.height,Matrix().apply { postRotate(rotation) },true)
            val caption = item["caption"] as? String ?: ""
            val bitmap = if (caption.isEmpty()) rotated else {
              val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color=Color.DKGRAY; textSize=12*resources.displayMetrics.density; textAlign=Paint.Align.CENTER }
              val labelHeight = (18*resources.displayMetrics.density).toInt()
              val width = maxOf(rotated.width,(paint.measureText(caption)+12*resources.displayMetrics.density).toInt())
              Bitmap.createBitmap(width,rotated.height+labelHeight,Bitmap.Config.ARGB_8888).also {
                val canvas=Canvas(it)
                canvas.drawBitmap(rotated,(width-rotated.width)/2f,0f,null)
                canvas.drawText(caption,width/2f,rotated.height+14*resources.displayMetrics.density,paint)
              }
            }
            images.put(cacheKey+"|base",rotated)
            images.put(cacheKey,bitmap)
            handler.post { if (signatures[id] == signature) { map.removeTMapMarkerItem(id); marker.setIcon(bitmap); marker.setPosition(num(anchor,"x",0.5).toFloat(),(num(anchor,"y",1.0)*px(item,"height")/bitmap.height).toFloat()); map.addTMapMarkerItem(marker); updateVisibility() } }
          } catch (error: Exception) { handler.post { onError(mapOf("message" to "Cannot load TMAP marker image: ${error.message}")) } }
        }
      }
      if (uri == null || marker.icon != null) map.addTMapMarkerItem(marker)
    }
    updateVisibility()
  }
  fun setLines(value: List<Map<String, Any>>) {
    lineData = value
    if (!ready) return
    val signature = value.toString()
    if (lineSignature == signature) return
    lineSignature = signature
    map.removeAllTMapPolyLine()
    for (item in value) {
      @Suppress("UNCHECKED_CAST") val points = item["points"] as? List<Map<String, Any>> ?: continue
      if (points.size < 2) continue
      val line = TMapPolyLine(item["id"] as? String ?: "",ArrayList(points.map(::point)))
      line.setLineColor(Color.parseColor(item["color"] as? String ?: "#1976D2")); line.setLineWidth(num(item,"width",3.0).toFloat() * resources.displayMetrics.density)
      map.addTMapPolyLine(line)
    }
  }
  fun setPosition(value: Map<String, Any>?) {
    positionData = value
    if (!ready) return
    // SDK 3.7's built-in location layer is uninitialized until its first location update.
    map.removeTMapMarkerItem("__tarago_location")
    if (value != null) {
      val size = (18*resources.displayMetrics.density).toInt()
      val image = Bitmap.createBitmap(size,size,Bitmap.Config.ARGB_8888)
      val canvas = Canvas(image)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG)
      paint.color = Color.WHITE; canvas.drawCircle(size/2f,size/2f,size/2f,paint)
      paint.color = Color.rgb(0,122,255); canvas.drawCircle(size/2f,size/2f,size/3f,paint)
      val marker = TMapMarkerItem()
      marker.setId("__tarago_location"); marker.setTMapPoint(point(value)); marker.setIcon(image)
      marker.setPosition(0.5f,0.5f); map.addTMapMarkerItem(marker)
    }
  }
  private fun updateVisibility() {
    for (item in markerData) {
      val marker = map.getMarkerItemFromId(item["id"] as? String ?: continue) ?: continue
      val visible = map.zoomLevel >= num(item,"minZoom")
      var changed = marker.visible != visible
      marker.setVisible(visible)
      val uri = item["imageUri"] as? String
      if (uri != null && !(item["caption"] as? String).isNullOrEmpty()) {
        val key = "$uri|${item["width"]}|${item["height"]}|${item["rotation"]}|${item["caption"]}"
        val icon = images.get(if (map.zoomLevel >= num(item,"captionMinZoom",18.0)) key else key+"|base")
        if (icon != null && marker.icon !== icon) {
          marker.setIcon(icon)
          @Suppress("UNCHECKED_CAST") val anchor = item["anchor"] as? Map<String,Any> ?: emptyMap()
          marker.setPosition(num(anchor,"x",0.5).toFloat(),(num(anchor,"y",1.0)*px(item,"height")/icon.height).toFloat())
          changed = true
        }
      }
      if (changed) map.updateTMapMarkerItem(marker)
    }
  }
  fun destroy() { handler.removeCallbacksAndMessages(null); executor.shutdownNow(); map.onDestroy() }
  private fun scheduleIdle() { handler.removeCallbacks(idle); handler.postDelayed(idle,150) }
  private fun placeIcon(): Bitmap {
    val density=resources.displayMetrics.density
    val image=Bitmap.createBitmap((32*density).toInt(),(40*density).toInt(),Bitmap.Config.ARGB_8888)
    val canvas=Canvas(image); canvas.scale(density,density)
    val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    val pin=Path().apply { moveTo(16f,40f); cubicTo(6f,26f,2f,22f,2f,14f); arcTo(android.graphics.RectF(2f,0f,30f,28f),180f,180f); cubicTo(30f,22f,26f,26f,16f,40f); close() }
    paint.color=Color.rgb(0,122,255); canvas.drawPath(pin,paint)
    paint.color=Color.WHITE; canvas.drawCircle(16f,14f,6f,paint)
    return image
  }
  private fun num(item: Map<String, Any>, key: String, fallback: Double = 0.0) = (item[key] as? Number)?.toDouble() ?: fallback
  private fun px(item: Map<String, Any>, key: String) = (num(item,key)*resources.displayMetrics.density).toInt()
  private fun point(item: Map<String, Any>) = TMapPoint(num(item,"latitude",num(item,"lat")),num(item,"longitude",num(item,"lng")))
}
