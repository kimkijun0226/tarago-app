Pod::Spec.new do |s|
  s.name = 'TaragoTmap'
  s.version = '1.0.0'
  s.summary = 'Native TMAP vector map for Tarago'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Tarago'
  s.homepage = 'https://tarago.cloud'
  s.source = { :git => '' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.0'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.vendored_frameworks = 'Frameworks/*.xcframework'
end
