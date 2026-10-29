'use client'

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { buttonClass, cx, Notice } from './ui'
import type { FormState } from '@/lib/form-state'

const PendingContext = createContext<boolean | null>(null)

// A form bound to a server action that returns { error } or { message }.
// Submits through onSubmit so React doesn't clear the fields when the
// action reports an error; clears them only when asked to after success.
export function ActionForm({ action, children, className, resetOnSuccess, onSuccess, id, validate }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>
  children: ReactNode
  className?: string
  resetOnSuccess?: boolean
  onSuccess?: (state: FormState) => void
  id?: string
  // Runs before submitting; a returned message is shown and stops the submit.
  validate?: () => string | null
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const [clientError, setClientError] = useState<string | null>(null)
  const ref = useRef<HTMLFormElement>(null)
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  })
  useEffect(() => {
    if (state && !state.error) {
      if (resetOnSuccess) ref.current?.reset()
      onSuccessRef.current?.(state)
    }
  }, [state, resetOnSuccess])
  return (
    <PendingContext value={pending}>
      <form
        id={id}
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault()
          const problem = validate?.() ?? null
          setClientError(problem)
          if (problem) return
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
          startTransition(() => formAction(fd))
        }}
      >
        {children}
        {(clientError || state?.error) && <Notice tone="danger" className="mt-3">{clientError || state?.error}</Notice>}
      </form>
    </PendingContext>
  )
}

export function SubmitButton({ children, variant = 'primary', size = 'md', className, name, value, confirm, form }: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  name?: string
  value?: string
  confirm?: string
  form?: string
}) {
  const ctx = useContext(PendingContext)
  const status = useFormStatus()
  const pending = ctx ?? status.pending
  return (
    <button
      type="submit"
      form={form}
      name={name}
      value={value}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault()
      }}
      className={cx(buttonClass(variant, size), className)}
    >
      {children}
    </button>
  )
}

// One-click server action (delete, mark done…) with an optional confirm.
export function ActionButton({ action, children, variant = 'ghost', size = 'sm', confirm, fields, className }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  confirm?: string
  fields?: Record<string, string | number>
  className?: string
}) {
  return (
    <ActionForm action={action} className={cx('inline', className)}>
      {Object.entries(fields ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} size={size} confirm={confirm}>{children}</SubmitButton>
    </ActionForm>
  )
}
