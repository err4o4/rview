import { Plus, Trash2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { AppConfig, StartableNode, NodeArg } from "@/lib/config/appConfig"

interface NodesTabProps {
  config: AppConfig
  launchOpenStates: boolean[]
  toggleLaunch: (index: number) => void
  addLaunch: () => void
  removeLaunch: (index: number) => void
  updateLaunch: (index: number, field: keyof StartableNode, value: any) => void
  addLaunchArg: (launchIndex: number) => void
  removeLaunchArg: (launchIndex: number, argIndex: number) => void
  updateLaunchArg: (launchIndex: number, argIndex: number, field: keyof NodeArg, value: string) => void
  addExclude: () => void
  removeExclude: (index: number) => void
  updateExclude: (index: number, value: string) => void
}

export function NodesTab({
  config,
  launchOpenStates,
  toggleLaunch,
  addLaunch,
  removeLaunch,
  updateLaunch,
  addLaunchArg,
  removeLaunchArg,
  updateLaunchArg,
  addExclude,
  removeExclude,
  updateExclude,
}: NodesTabProps) {
  return (
    <TabsContent value="nodes" className="space-y-6 mt-4">
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Nodes</Label>
            <Button size="sm" variant="ghost" onClick={addLaunch}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {config.nodes.launch.map((launch, launchIndex) => (
            <Collapsible
              key={launchIndex}
              open={launchOpenStates[launchIndex]}
              onOpenChange={() => toggleLaunch(launchIndex)}
            >
              <div className="border rounded-md p-2">
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-foreground flex-1 text-left">
                    <ChevronDown className={`h-4 w-4 transition-transform ${launchOpenStates[launchIndex] ? "" : "-rotate-90"}`} />
                    {launch.package || "New Launch"} / {launch.launchFile || "..."}
                  </CollapsibleTrigger>
                  <Button size="icon" variant="ghost" onClick={() => removeLaunch(launchIndex)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CollapsibleContent className="space-y-2">
                  <Input
                    value={launch.package}
                    onChange={(e) => updateLaunch(launchIndex, "package", e.target.value)}
                    placeholder="Package name"
                  />
                  <Input
                    value={launch.launchFile}
                    onChange={(e) => updateLaunch(launchIndex, "launchFile", e.target.value)}
                    placeholder="Launch file"
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Arguments</Label>
                      <Button size="sm" variant="ghost" onClick={() => addLaunchArg(launchIndex)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    {launch.args.map((arg, argIndex) => (
                      <div key={argIndex} className="flex gap-2">
                        <Input
                          value={arg.key}
                          onChange={(e) => updateLaunchArg(launchIndex, argIndex, "key", e.target.value)}
                          placeholder="Key"
                          className="flex-1"
                        />
                        <Input
                          value={arg.value}
                          onChange={(e) => updateLaunchArg(launchIndex, argIndex, "value", e.target.value)}
                          placeholder="Value"
                          className="flex-1"
                        />
                        <Button size="icon" variant="ghost" onClick={() => removeLaunchArg(launchIndex, argIndex)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      </div>

      {/* Hide Nodes */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-4 w-4" />
          Hide Nodes
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={addExclude}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {config.nodes.exclude.map((exclude, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={exclude}
                onChange={(e) => updateExclude(index, e.target.value)}
                placeholder="/rosout"
              />
              <Button size="icon" variant="ghost" onClick={() => removeExclude(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </TabsContent>
  )
}
