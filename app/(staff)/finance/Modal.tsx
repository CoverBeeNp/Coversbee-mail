'use client'

import { createContext, useContext, useRef } from 'react'

const ModalCloseContext = createContext<() => void>(() => {})

// A form rendered inside <Modal> calls this to close the dialog after a
// successful submit. Outside a Modal it's a harmless no-op (the default
// context value), so the same form component can be used standalone too.
export function useModalClose() {
  return useContext(ModalCloseContext)
}

export function Modal({
  triggerLabel,
  triggerClassName,
  title,
  children,
}: {
  triggerLabel: string
  triggerClassName: string
  title: string
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const close = () => dialogRef.current?.close()

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => dialogRef.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog ref={dialogRef} className="modal-dialog">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={close} aria-label="Close" className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
      </dialog>
    </>
  )
}
