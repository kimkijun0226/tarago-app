import ExpoModulesCore
import WidgetKit

public final class TaraGoWidgetsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TaraGoWidgets")
    Function("writeConfiguration") { (json: String) in
      guard let data = json.data(using: .utf8) else { throw TaraGoWidgetStore.StoreError.invalidConfiguration }
      let configuration = try JSONDecoder().decode(TaraGoWidgetConfiguration.self, from: data)
      try TaraGoWidgetStore.write(configuration)
      WidgetCenter.shared.reloadTimelines(ofKind: "TaraGoTransit")
    }
  }
}
