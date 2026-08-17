import { ArrowUpRightIcon, CheckIcon } from './icons'

interface SubmissionSuccessProps {
  onReset: () => void
}

export function SubmissionSuccess({ onReset }: SubmissionSuccessProps) {
  return (
    <section className="success-state" aria-labelledby="success-title" tabIndex={-1}>
      <div className="success-mark"><CheckIcon /></div>
      <span className="success-eyebrow">Application received</span>
      <h2 id="success-title">CV Submitted Successfully</h2>
      <p>
        Thank you for your application. Your CV has been successfully submitted to Altrium.
      </p>
      <p className="success-secondary">
        If your application progresses, our recruitment team will contact you.
      </p>
      <button type="button" className="submit-button" onClick={onReset}>
        Back to Careers
        <ArrowUpRightIcon />
      </button>
    </section>
  )
}
