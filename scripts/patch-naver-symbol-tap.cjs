/** 네이버 SDK 심벌 클릭의 이름·좌표를 기존 지도 이벤트에 연결한다. SDK 갱신 시 일치하지 않는 패치는 중단한다. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('@mj-studio/react-native-naver-map/package.json'));
function patch(file, before, after) {
  const target = path.join(root, file);
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(after)) return;
  if (file.startsWith('lib/typescript/') && source.includes('symbolPeers?: string')) return;
  if (
    file === 'src/component/NaverMapView.tsx' &&
    after.includes('symbolCaption') &&
    source.includes('symbolPeers?: string')
  )
    return;
  if (!source.includes(before)) throw new Error(`네이버 심벌 패치 대상 불일치: ${file}`);
  fs.writeFileSync(target, source.replace(before, after));
}
patch(
  'src/spec/RNCNaverMapViewNativeComponent.ts',
  '      x: Double;\n      y: Double;',
  '      x: Double;\n      y: Double;\n      symbolCaption: string;',
);
patch(
  'src/component/NaverMapView.tsx',
  'onTapMap?: (params: Coord & { x: number; y: number }) => void;',
  'onTapMap?: (params: Coord & { x: number; y: number; symbolCaption?: string }) => void;',
);
patch(
  'src/component/NaverMapView.tsx',
  'nativeEvent: { longitude, latitude, x, y },\n      }: NativeSyntheticEvent<Coord & { x: number; y: number }>',
  'nativeEvent: { longitude, latitude, x, y, symbolCaption },\n      }: NativeSyntheticEvent<Coord & { x: number; y: number; symbolCaption?: string }>',
);
patch(
  'src/component/NaverMapView.tsx',
  '          longitude,\n          latitude,\n          x,\n          y,',
  '          longitude,\n          latitude,\n          x,\n          y,\n          symbolCaption,',
);
for (const format of ['commonjs', 'module']) {
  patch(
    `lib/typescript/${format}/src/component/NaverMapView.d.ts`,
    '        x: number;\n        y: number;\n    }) => void;',
    '        x: number;\n        y: number;\n        symbolCaption?: string;\n    }) => void;',
  );
}
/** 자체 심벌 연결 블록만 교체해 이전 패치 버전에서도 같은 결과를 만든다. */
function replaceHandler(file, start, end, replacement) {
  const target = path.join(root, file);
  let source = fs.readFileSync(target, 'utf8');
  const original = source;
  const from = source.indexOf(start);
  const to = source.indexOf(end, Math.max(0, from));
  if (to < 0) throw new Error(`네이버 심벌 핸들러 대상 불일치: ${file}`);
  source =
    from < 0
      ? source.slice(0, to) + replacement + source.slice(to)
      : source.slice(0, from) + replacement + source.slice(to);
  if (source !== original) fs.writeFileSync(target, source);
}
replaceHandler(
  'ios/RNCNaverMapViewImpl.mm',
  '- (BOOL)mapView:(NMFMapView*)mapView didTapSymbol:',
  '- (void)mapView:(NMFMapView*)mapView didTapMap:',
  `- (BOOL)mapView:(NMFMapView*)mapView didTapSymbol:(NMFSymbol*)symbol {
  if (!_rncParent.emitter) return NO;
  CGPoint point = [mapView.projection pointFromLatLng:symbol.position];
  NSMutableArray* peers = [NSMutableArray array];
  for (id item in [mapView pickAll:point withTolerance:MAX(mapView.bounds.size.width, mapView.bounds.size.height)]) {
    if (![item isKindOfClass:[NMFSymbol class]]) continue;
    NMFSymbol* peer = (NMFSymbol*)item;
    if (![peer.caption isEqualToString:symbol.caption]) continue;
    [peers addObject:@{@"latitude": @(peer.position.lat), @"longitude": @(peer.position.lng)}];
  }
  NSData* data = [NSJSONSerialization dataWithJSONObject:peers options:0 error:nil];
  NSString* json = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"[]";
  _rncParent.emitter->onTapMap({
      .latitude = symbol.position.lat,
      .longitude = symbol.position.lng,
      .x = point.x,
      .y = point.y,
      .symbolCaption = std::string([symbol.caption UTF8String] ?: ""),
      .symbolPeers = std::string([json UTF8String] ?: "[]"),
  });
  return YES;
}

`,
);
const android = 'android/src/main/java/com/mjstudio/reactnativenavermap/';
patch(
  android + 'event/NaverMapTapEvent.kt',
  '  private val y: Double,',
  '  private val y: Double,\n  private val symbolCaption: String = "",',
);
patch(
  android + 'event/NaverMapTapEvent.kt',
  '      putDouble("y", y)',
  '      putDouble("y", y)\n      putString("symbolCaption", symbolCaption)',
);
replaceHandler(
  android + 'mapview/RNCNaverMapView.kt',
  '      it.setOnSymbolClickListener { symbol ->',
  '      it.setOnMapClickListener { pointF, latLng ->',
  `      it.setOnSymbolClickListener { symbol ->
        val point = it.projection.toScreenLocation(symbol.position)
        val peers = org.json.JSONArray()
        it.pickAll(point, maxOf(width, height))
          .filterIsInstance<com.naver.maps.map.Symbol>()
          .filter { peer -> peer.caption == symbol.caption }
          .forEach { peer ->
            peers.put(org.json.JSONObject().put("latitude", peer.position.latitude)
              .put("longitude", peer.position.longitude))
          }
        reactContext.emitEvent(reactTag) { surfaceId, reactTag ->
          NaverMapTapEvent(surfaceId, reactTag, symbol.position.latitude,
            symbol.position.longitude, point.x.toDouble(), point.y.toDouble(), symbol.caption, peers.toString())
        }
        true
      }
`,
);
patch(
  'src/spec/RNCNaverMapViewNativeComponent.ts',
  '      symbolCaption: string;',
  '      symbolCaption: string;\n      symbolPeers: string;',
);
patch(
  'src/component/NaverMapView.tsx',
  'nativeEvent: { longitude, latitude, x, y, symbolCaption },',
  'nativeEvent: { longitude, latitude, x, y, symbolCaption, symbolPeers },',
);
patch(
  'src/component/NaverMapView.tsx',
  '          symbolCaption,',
  '          symbolCaption,\n          symbolPeers,',
);
// 공개 타입과 이벤트 변환 타입을 함께 확장한다.
const component = path.join(root, 'src/component/NaverMapView.tsx');
fs.writeFileSync(
  component,
  fs
    .readFileSync(component, 'utf8')
    .replaceAll('symbolCaption?: string }', 'symbolCaption?: string; symbolPeers?: string }'),
);
for (const format of ['commonjs', 'module']) {
  patch(
    `lib/typescript/${format}/src/component/NaverMapView.d.ts`,
    '        symbolCaption?: string;',
    '        symbolCaption?: string;\n        symbolPeers?: string;',
  );
}
patch(
  android + 'event/NaverMapTapEvent.kt',
  '  private val symbolCaption: String = "",',
  '  private val symbolCaption: String = "",\n  private val symbolPeers: String = "[]",',
);
patch(
  android + 'event/NaverMapTapEvent.kt',
  '      putString("symbolCaption", symbolCaption)',
  '      putString("symbolCaption", symbolCaption)\n      putString("symbolPeers", symbolPeers)',
);

/** 카메라 정착 시 SDK가 실제로 표시한 심벌 좌표를 함께 전달한다. */
function update(file, transform) {
  const target = path.join(root, file);
  const source = fs.readFileSync(target, 'utf8');
  const result = transform(source);
  if (result !== source) fs.writeFileSync(target, result);
}
update('src/spec/RNCNaverMapViewNativeComponent.ts', source => source.replace(
  /(onCameraIdle\?: DirectEventHandler<[\s\S]*?regionLongitudeDelta: Double;)(?!\n      visibleSymbols)/,
  '$1\n      visibleSymbols: string;',
));
for (const file of ['src/component/NaverMapView.tsx', ...['commonjs', 'module'].map(format =>
  `lib/typescript/${format}/src/component/NaverMapView.d.ts`)]) {
  update(file, source => {
    if (source.includes('visibleSymbols?: string')) return source;
    source = source.replace(/(onCameraIdle\?: \(params: Camera & \{)/, '$1 visibleSymbols?: string;');
    if (!file.endsWith('.tsx')) return source;
    const start = source.indexOf('    const onCameraIdle =');
    const end = source.indexOf('    const onTapMap =', start);
    const block = source.slice(start, end)
      .replace('          bearing,', '          visibleSymbols,\n          bearing,')
      .replace('        Camera & {', '        Camera & {\n          visibleSymbols?: string;')
      .replace('        onCameraIdleProp?.({', '        onCameraIdleProp?.({\n          visibleSymbols,');
    return source.slice(0, start) + block + source.slice(end);
  });
}
update('ios/RNCNaverMapViewImpl.mm', source => {
  const start = source.indexOf('- (void)mapViewCameraIdle:');
  const end = source.indexOf('- (BOOL)mapView:', start);
  let block = source.slice(start, end);
  if (block.includes('.visibleSymbols =')) return source;
  block = block.replace('  _rncParent.emitter->onCameraIdle({', `  NSMutableArray* symbols = [NSMutableArray array];
  if (pos.zoom >= 14) {
    CGPoint center = CGPointMake(CGRectGetMidX(mapView.bounds), CGRectGetMidY(mapView.bounds));
    for (id item in [mapView pickAll:center withTolerance:MAX(mapView.bounds.size.width, mapView.bounds.size.height)]) {
      if (![item isKindOfClass:[NMFSymbol class]]) continue;
      NMFSymbol* symbol = (NMFSymbol*)item;
      CGPoint point = [mapView.projection pointFromLatLng:symbol.position];
      if (!CGRectContainsPoint(mapView.bounds, point)) continue;
      [symbols addObject:@{@"latitude": @(symbol.position.lat), @"longitude": @(symbol.position.lng),
        @"caption": symbol.caption ?: @""}];
      if (symbols.count >= 512) break;
    }
  }
  NSData* data = [NSJSONSerialization dataWithJSONObject:symbols options:0 error:nil];
  NSString* json = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"[]";
  _rncParent.emitter->onCameraIdle({
      .visibleSymbols = std::string([json UTF8String] ?: "[]"),`);
  return source.slice(0, start) + block + source.slice(end);
});
update(android + 'event/NaverMapCameraIdleEvent.kt', source => source.includes('visibleSymbols') ? source : source
  .replace('  private val regionLongitudeDelta: Double,', '  private val regionLongitudeDelta: Double,\n  private val visibleSymbols: String = "[]",')
  .replace('      putDouble("latitude", latitude)', '      putString("visibleSymbols", visibleSymbols)\n      putDouble("latitude", latitude)'));
update(android + 'mapview/RNCNaverMapView.kt', source => {
  const start = source.indexOf('      it.addOnCameraIdleListener {');
  const end = source.indexOf('      it.setOnSymbolClickListener', start);
  let block = source.slice(start, end);
  if (block.includes('val symbols =')) return source;
  block = block.replace('          val bounds = it.coveringBounds', `          val bounds = it.coveringBounds
          val symbols = org.json.JSONArray()
          if (it.cameraPosition.zoom >= 14) {
            it.pickAll(android.graphics.PointF(width / 2f, height / 2f), maxOf(width, height))
              .filterIsInstance<com.naver.maps.map.Symbol>()
              .filter { symbol ->
                val point = it.projection.toScreenLocation(symbol.position)
                point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height
              }.take(512).forEach { symbol ->
                symbols.put(org.json.JSONObject().put("latitude", symbol.position.latitude)
                  .put("longitude", symbol.position.longitude).put("caption", symbol.caption))
              }
          }`)
    .replace('            bounds.eastLongitude - bounds.westLongitude,', '            bounds.eastLongitude - bounds.westLongitude,\n            symbols.toString(),');
  return source.slice(0, start) + block + source.slice(end);
});

// 이동 중에도 검증된 심벌 스냅샷을 전달한다. 플랫폼별로 120ms 간격을 제한한다.
update('ios/RNCNaverMapViewImpl.h', source => source.includes('lastSymbolSnapshotTime') ? source :
  source.replace('@property(nonatomic, weak) RNCNaverMapView* rncParent;',
    '@property(nonatomic, weak) RNCNaverMapView* rncParent;\n@property(nonatomic, assign) NSTimeInterval lastSymbolSnapshotTime;'));
update('ios/RNCNaverMapViewImpl.mm', source => {
  const start = source.indexOf('- (void)mapView:(NMFMapView*)mapView cameraIsChangingByReason:');
  const end = source.indexOf('- (void)mapViewCameraIdle:', start);
  let block = source.slice(start, end);
  if (block.includes('lastSymbolSnapshotTime')) return source;
  block = block.replace('  NMFCameraPosition* pos =', `  NSTimeInterval now = [NSDate timeIntervalSinceReferenceDate];
  if (now - self.lastSymbolSnapshotTime >= 0.12) {
    self.lastSymbolSnapshotTime = now;
    [self mapViewCameraIdle:mapView];
  }
  NMFCameraPosition* pos =`);
  return source.slice(0, start) + block + source.slice(end);
});
update(android + 'mapview/RNCNaverMapView.kt', source => {
  if (source.includes('emitSymbolSnapshot')) return source;
  const idleStart = source.indexOf('      it.addOnCameraIdleListener {');
  const idleEnd = source.indexOf('      it.setOnSymbolClickListener', idleStart);
  if (idleStart < 0 || idleEnd < 0) throw new Error('네이버 카메라 스냅샷 패치 위치 불일치');
  const idle = source.slice(idleStart, idleEnd).trimEnd();
  const snapshot = idle.replace('it.addOnCameraIdleListener {', 'val emitSymbolSnapshot: () -> Unit = {');
  source = source.slice(0, idleStart) + '      it.addOnCameraIdleListener { emitSymbolSnapshot() }\n\n' + source.slice(idleEnd);
  source = source.replace('      it.addOnCameraChangeListener { reason, animated ->', `${snapshot}
      var lastSymbolSnapshotTime = 0L
      it.addOnCameraChangeListener { reason, animated ->
        val now = android.os.SystemClock.uptimeMillis()
        if (now - lastSymbolSnapshotTime >= 120) {
          lastSymbolSnapshotTime = now
          emitSymbolSnapshot()
        }`);
  return source;
});

// 카메라 정지 뒤 지도 타일이 늦게 그려져도 마지막 심벌을 한 번 더 확인한다.
update('ios/RNCNaverMapViewImpl.h', source => source.includes('symbolRefreshPending') ? source : source
  .replace('NMFMapViewOptionDelegate>', 'NMFMapViewOptionDelegate, NMFMapViewRenderDelegate>')
  .replace('@property(nonatomic, assign) NSTimeInterval lastSymbolSnapshotTime;',
    '@property(nonatomic, assign) NSTimeInterval lastSymbolSnapshotTime;\n@property(nonatomic, assign) BOOL symbolRefreshPending;'));
update('ios/RNCNaverMapViewImpl.mm', source => {
  if (source.includes('mapViewDidFinishRenderingFrame:')) return source;
  return source.replace('[self.mapView addCameraDelegate:self];',
    '[self.mapView addCameraDelegate:self];\n    [self.mapView addRenderDelegate:self];')
    .replace('  NSTimeInterval now = [NSDate timeIntervalSinceReferenceDate];',
      '  self.symbolRefreshPending = YES;\n  NSTimeInterval now = [NSDate timeIntervalSinceReferenceDate];')
    .replace('#pragma clang diagnostic pop', `- (void)mapViewDidFinishRenderingFrame:(NMFMapView*)mapView fully:(BOOL)fully stable:(BOOL)stable {
  NSTimeInterval now = [NSDate timeIntervalSinceReferenceDate];
  if (fully && stable && self.symbolRefreshPending && now - self.lastSymbolSnapshotTime >= 0.12) {
    self.symbolRefreshPending = NO;
    self.lastSymbolSnapshotTime = now;
    [self mapViewCameraIdle:mapView];
  }
}

#pragma clang diagnostic pop`);
});
update(android + 'mapview/RNCNaverMapView.kt', source => source.includes('symbolRefreshPending') ? source : source
  .replace('      var lastSymbolSnapshotTime = 0L', '      var symbolRefreshPending = true\n      var lastSymbolSnapshotTime = 0L')
  .replace('        val now = android.os.SystemClock.uptimeMillis()', '        symbolRefreshPending = true\n        val now = android.os.SystemClock.uptimeMillis()')
  .replace('      it.addOnCameraIdleListener { emitSymbolSnapshot() }', `      it.addOnCameraIdleListener { emitSymbolSnapshot() }
      it.addOnMapRenderedListener { fully, stable ->
        val now = android.os.SystemClock.uptimeMillis()
        if (fully && stable && symbolRefreshPending && now - lastSymbolSnapshotTime >= 120) {
          symbolRefreshPending = false
          lastSymbolSnapshotTime = now
          emitSymbolSnapshot()
        }
      }`));
