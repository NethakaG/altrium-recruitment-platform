interface ErrorMessageProps {
  id?: string
  message: string
}

export function ErrorMessage({ id, message }: ErrorMessageProps) {
  return (
    <div id={id} className="error-message" role="alert">
      <span aria-hidden="true">!</span>
      <p>{message}</p>
    </div>
  )
}
