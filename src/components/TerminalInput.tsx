import { forwardRef, KeyboardEvent, useEffect, useRef } from 'react'
import { useCommandHistory } from '../hooks/useCommandHistory'

interface Props {
  onSubmit: (command: string) => void
  disabled?: boolean
  suggestions?: string[]
  prompt?: string
  masked?: boolean
  noHistory?: boolean
}

export const TerminalInput = forwardRef<HTMLInputElement, Props>(
  function TerminalInput({
    onSubmit,
    disabled = false,
    suggestions = [],
    prompt = 'nexus $',
    masked = false,
    noHistory = false,
  }, ref) {
    const { push, navigate } = useCommandHistory()
    const tabIndex = useRef(-1)

    useEffect(() => {
      if (!disabled && ref && 'current' in ref) {
        ref.current?.focus()
      }
    }, [disabled, ref])

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      const input = ref && 'current' in ref ? ref.current : null
      if (!input) return

      if (e.key === 'Enter') {
        const value = input.value
        if (value) {
          if (!noHistory && !masked) push(value)
          onSubmit(value)
          input.value = ''
        }
        e.preventDefault()
        return
      }

      if (masked) return  // no history navigation for password fields

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        input.value = navigate('up')
        setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0)
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        if (suggestions.length === 0) return
        tabIndex.current = (tabIndex.current + 1) % suggestions.length
        input.value = suggestions[tabIndex.current] ?? ''
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        input.value = navigate('down')
        setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0)
        return
      }
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0.5rem 1.5rem',
        borderTop: '1px solid var(--color-border)',
        gap: '0.75rem',
      }}>
        <span style={{
          color: 'var(--color-system)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size)',
          flexShrink: 0,
          userSelect: 'none',
        }}>
          {prompt}
        </span>

        <input
          ref={ref}
          type={masked ? 'password' : 'text'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--color-output)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size)',
            lineHeight: 'var(--line-height)',
            caretColor: 'var(--color-output)',
          }}
        />
      </div>
    )
  }
)
