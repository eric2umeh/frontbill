'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CircleHelp, GripVertical, MessageCircle, Send } from 'lucide-react'
import { HELP_SUGGESTION_CHIPS, matchHelpQuestion } from '@/lib/help/match-help'
import { cn } from '@/lib/utils'

type ChatMsg =
  | { id: string; role: 'assistant'; text: string; title?: string }
  | { id: string; role: 'user'; text: string }

const WELCOME =
  "Hi! I'm the FrontBill help assistant. Try a chip below, or ask things like “How do I make a booking?” or “How do I make a reservation?” Keyword answers only — nothing is sent to an AI server."

const POS_KEY = 'frontbill_help_fab_pos'

type FabPos = { x: number; y: number }

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clampPos(x: number, y: number, w: number, h: number): FabPos {
  const pad = 8
  return {
    x: Math.min(Math.max(pad, x), Math.max(pad, window.innerWidth - w - pad)),
    y: Math.min(Math.max(pad, y), Math.max(pad, window.innerHeight - h - pad)),
  }
}

function defaultPos(w: number, h: number): FabPos {
  if (typeof window === 'undefined') return { x: 24, y: 24 }
  return clampPos(window.innerWidth - w - 24, window.innerHeight - h - 24, w, h)
}

export function HelpAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 'welcome', role: 'assistant', text: WELCOME },
  ])
  const bottomRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)

  const [pos, setPos] = useState<FabPos | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const w = 72
    const h = 36
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as FabPos
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPos(clampPos(parsed.x, parsed.y, w, h))
          return
        }
      }
    } catch {
      /* ignore */
    }
    setPos(defaultPos(w, h))
  }, [])

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    const openHelp = () => setOpen(true)
    window.addEventListener('frontbill:open-help', openHelp)
    return () => window.removeEventListener('frontbill:open-help', openHelp)
  }, [])

  useEffect(() => {
    const onResize = () => {
      setPos((p) => {
        if (!p) return p
        const rect = btnRef.current?.getBoundingClientRect()
        const w = rect?.width ?? 96
        const h = rect?.height ?? 48
        return clampPos(p.x, p.y, w, h)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const persistPos = useCallback((next: FabPos) => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
      moved: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true
    if (!d.moved) return
    const rect = e.currentTarget.getBoundingClientRect()
    setPos(clampPos(d.origX + dx, d.origY + dy, rect.width, rect.height))
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    setDragging(false)
    if (d.moved) {
      setPos((p) => {
        if (p) persistPos(p)
        return p
      })
    } else {
      setOpen(true)
    }
    dragRef.current = null
  }

  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return

    const userMsg: ChatMsg = { id: newId(), role: 'user', text: q }
    const hit = matchHelpQuestion(q)
    const assistantMsg: ChatMsg = hit
      ? {
          id: newId(),
          role: 'assistant',
          title: hit.question,
          text: hit.answer,
        }
      : {
          id: newId(),
          role: 'assistant',
          text:
            "I don't have a saved answer for that yet. Try a chip below, or ask about Daily book, POS accounts, stay date, Night Audit, reservations, outlets, or cashback.",
        }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
  }

  const showChips =
    messages.length <= 1 ||
    messages[messages.length - 1]?.role === 'assistant'

  return (
    <>
      <Button
        ref={btnRef}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          'fixed z-40 h-9 gap-1 rounded-full px-2.5 py-0 shadow-md touch-none select-none',
          dragging ? 'cursor-grabbing scale-[1.03]' : 'cursor-grab',
          !pos && 'bottom-4 right-4 md:bottom-6 md:right-6',
        )}
        style={
          pos
            ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
            : undefined
        }
        aria-label="Open help (drag to move)"
        title="Drag to move · click to open"
      >
        <GripVertical className="h-3 w-3 opacity-60 shrink-0" aria-hidden />
        <CircleHelp className="h-4 w-4" />
        <span className="text-[11px] font-medium leading-none">Help</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md flex flex-col p-0 gap-0 bg-muted/30"
        >
          <SheetHeader className="p-4 border-b bg-background text-left space-y-1">
            <SheetTitle className="text-xl">Help &amp; FAQ</SheetTitle>
            <SheetDescription>
              Quick answers about FrontBill. For live amounts, use Daily book and Transactions.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col min-h-0 p-3 sm:p-4">
            <div className="flex-1 flex flex-col min-h-0 rounded-xl border bg-background shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b px-3 py-2.5">
                <MessageCircle className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-none">FrontBill help</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Keyword answers — no login data shared
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2 text-sm leading-relaxed">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex justify-start">
                      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm leading-relaxed space-y-1.5">
                        {m.title ? (
                          <p className="font-semibold text-foreground">{m.title}</p>
                        ) : null}
                        <p className="text-muted-foreground whitespace-pre-wrap">{m.text}</p>
                      </div>
                    </div>
                  ),
                )}

                {showChips && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {HELP_SUGGESTION_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => ask(chip)}
                        className={cn(
                          'rounded-full border bg-background px-3 py-1.5 text-xs text-left',
                          'hover:bg-muted transition-colors',
                        )}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <form
                className="border-t p-2.5 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  ask(input)
                }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about Daily book, POS accounts, Night Audit…"
                  className="rounded-full"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-full shrink-0 h-10 w-10"
                  disabled={!input.trim()}
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
