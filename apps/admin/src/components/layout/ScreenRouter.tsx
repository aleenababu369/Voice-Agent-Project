import { useAppSelector } from "../../app/hooks";
import { OverviewScreen } from "../../screens/OverviewScreen";
import { OnboardScreen } from "../../screens/OnboardScreen";
import { BuildAgentScreen } from "../../screens/BuildAgentScreen";
import { AssignAgentScreen } from "../../screens/AssignAgentScreen";
import { CallConsoleScreen } from "../../screens/CallConsoleScreen";
import { RecordsScreen } from "../../screens/RecordsScreen";
import { OperationsScreen } from "../../screens/OperationsScreen";
import { AnalyticsScreen } from "../../screens/AnalyticsScreen";
import { SettingsScreen } from "../../screens/SettingsScreen";

export function ScreenRouter() {
  const screen = useAppSelector((state) => state.platform.activeScreen);
  switch (screen) {
    case "onboard":
      return <OnboardScreen />;
    case "build":
      return <BuildAgentScreen />;
    case "assign":
      return <AssignAgentScreen />;
    case "call":
      return <CallConsoleScreen />;
    case "records":
      return <RecordsScreen />;
    case "operations":
      return <OperationsScreen />;
    case "analytics":
      return <AnalyticsScreen />;
    case "settings":
      return <SettingsScreen />;
    case "home":
    default:
      return <OverviewScreen />;
  }
}
