Pod::Spec.new do |s|
  s.name = 'TaraGoNotificationVoice'
  s.version = '1.0.0'
  s.summary = 'Prepared spoken notification sounds'
  s.description = 'Creates local notification audio before a reservation runs.'
  s.license = { :type => 'MIT' }
  s.author = 'TaraGo'
  s.homepage = 'https://github.com/kimkijun0226/tarago-app'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/kimkijun0226/tarago-app.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation'
  s.source_files = '**/*.swift'
end
