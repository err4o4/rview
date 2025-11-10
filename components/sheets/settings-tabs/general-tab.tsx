import { useTheme } from "next-themes"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { TabsContent } from "@/components/ui/tabs"
import type { AppConfig } from "@/lib/config/appConfig"

interface GeneralTabProps {
  config: AppConfig
  updateConnection: (field: keyof AppConfig["connection"], value: string) => void
  updateSupervisor: (field: keyof AppConfig["supervisor"], value: string) => void
}

export function GeneralTab({ config, updateConnection, updateSupervisor }: GeneralTabProps) {
  const { theme, setTheme } = useTheme()

  return (
    <TabsContent value="general" className="space-y-6 mt-4">
      <div className="space-y-2">
        <Label htmlFor="connection-url">Connection URL</Label>
        <Input
          id="connection-url"
          value={config.connection.url}
          onChange={(e) => updateConnection("url", e.target.value)}
          placeholder="ws://192.168.1.220:8765"
          autoFocus={false}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">Supervisor</h3>

        <div className="space-y-2">
          <Label htmlFor="supervisor-topic">Status Topic</Label>
          <Input
            id="supervisor-topic"
            value={config.supervisor.topic}
            onChange={(e) => updateSupervisor("topic", e.target.value)}
            placeholder="/supervisor/status"
            autoFocus={false}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="supervisor-service">Command Service</Label>
          <Input
            id="supervisor-service"
            value={config.supervisor.service}
            onChange={(e) => updateSupervisor("service", e.target.value)}
            placeholder="/supervisor/command"
            autoFocus={false}
          />
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="flex items-center justify-between py-2">
        <Label htmlFor="theme-toggle">Dark Mode</Label>
        <Switch
          id="theme-toggle"
          checked={theme === "dark"}
          onCheckedChange={(checked: boolean) => setTheme(checked ? "dark" : "light")}
        />
      </div>
    </TabsContent>
  )
}
