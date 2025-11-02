"use client"

import { useState } from "react"
import { Circle, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { useRosRecordings, formatFileSize, formatTime, type Recording } from "@/lib/hooks/useRosRecordings"

interface RecordSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RecordSheet({ open, onOpenChange }: RecordSheetProps) {
  const { recordings, loading, error, connected, recordingStatus, deleteRecording, startRecording, stopRecording } = useRosRecordings()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [recordingToDelete, setRecordingToDelete] = useState<Recording | null>(null)

  const handleToggleRecording = async () => {
    try {
      if (recordingStatus.recording) {
        await stopRecording()
      } else {
        await startRecording()
      }
    } catch (err) {
      console.error("Failed to toggle recording:", err)
    }
  }

  const handleDeleteRecording = async (filename: string) => {
    setDeletingId(filename)
    try {
      await deleteRecording(filename)
      setRecordingToDelete(null)
    } catch (err) {
      console.error("Failed to delete recording:", err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteClick = (recording: Recording) => {
    setRecordingToDelete(recording)
  }

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString() + " " + date.toLocaleTimeString()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><Circle className={`h-4 w-4 ${recordingStatus.recording ? "text-destructive": "default"}`}/></Button>
      </SheetTrigger>
      <SheetContent
        className="flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Recorder</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-6 -mx-4 px-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Recording Control Block */}
              <div className="flex flex-col items-center space-y-4">
                <Button
                  onClick={handleToggleRecording}
                  variant={recordingStatus.recording ? "destructive" : "default"}
                  size="icon"
                  className="h-16 w-16 rounded-full"
                >
                  <Circle
                    className={`h-6 w-6 ${
                      recordingStatus.recording ? "fill-current animate-pulse" : ""
                    }`}
                  />
                </Button>
                <div className="text-3xl font-mono font-bold text-center">
                  {formatTime(recordingStatus.recordingTime)}
                </div>
                <div className="text-xs text-muted-foreground text-center space-y-1">
                  <div>{formatFileSize(recordingStatus.filesize)}/{formatFileSize(recordingStatus.spaceLeft)}</div>
                </div>
              </div>

              {/* Recordings List Block */}
              <div>
                {error && (
                  <div className="text-sm text-destructive py-4 text-center">
                    {error}
                  </div>
                )}

                {!error && recordings.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    No recordings found
                  </div>
                )}

                {!error &&
                  recordings.map((recording) => {
                    const isActive = recording.name.endsWith(".active")
                    return (
                      <Item key={recording.id} className="py-2">
                        <ItemContent>
                          <ItemTitle className={isActive ? "text-green-500" : ""}>
                            {recording.name}
                          </ItemTitle>
                          <ItemDescription>
                            {formatFileSize(recording.size)} •{" "}
                            {formatDate(recording.createdAt)}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteClick(recording)}
                            disabled={deletingId === recording.id || isActive}
                            aria-label="Delete recording"
                          >
                            {deletingId === recording.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </ItemActions>
                      </Item>
                    )
                  })}
              </div>
            </>
          )}
        </div>
      </SheetContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={recordingToDelete !== null}
        onOpenChange={(open) => !open && setRecordingToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recording?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{recordingToDelete?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                recordingToDelete && handleDeleteRecording(recordingToDelete.name)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
