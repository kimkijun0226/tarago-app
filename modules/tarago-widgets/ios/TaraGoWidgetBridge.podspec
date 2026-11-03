Pod::Spec.new do |s|
  s.name = 'TaraGoWidgetBridge'
  s.version = '1.0.0'
  s.summary = 'TaraGo home widget settings'
  s.description = 'Shares selected transit routes with the WidgetKit extension.'
  s.license = { :type => 'MIT' }
  s.author = 'TaraGo'
  s.homepage = 'https://github.com/kimkijun0226/tarago-app'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/kimkijun0226/tarago-app.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WidgetKit'
  s.source_files = '**/*.swift'
end
