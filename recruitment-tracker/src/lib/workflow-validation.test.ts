import { describe, expect, it } from 'vitest'
import { addWorkflowStage, moveWorkflowStage, removeWorkflowStage, validateWorkflow } from './workflow-validation'
import { emptyWorkflow, type WorkflowDraftStage } from '../types/workflows'

function stage(stage_type: WorkflowDraftStage['stage_type'], name: string): WorkflowDraftStage {
  return { key: `${stage_type}-${name}`, stage_type, name }
}

describe('validateWorkflow', () => {
  it('accepts the confirmed Marketing Intern workflow', () => {
    const workflow = [
      stage('cv_review', 'CV Review'),
      stage('hr_interview', 'HR Interview'),
      stage('hiring_manager_interview', 'Hiring Manager Interview'),
      stage('final_decision', 'Final Decision'),
    ]

    expect(validateWorkflow(workflow)).toEqual({})
  })

  it('requires CV Review first and Final Decision last', () => {
    const workflow = [stage('hr_screening', 'HR Screening'), stage('technical_interview', 'Technical Interview')]

    expect(validateWorkflow(workflow)).toEqual({
      0: 'CV Review must be Step 1.',
      1: 'Final Decision must be the last step.',
    })
  })

  it('rejects duplicate standard and custom stages', () => {
    const workflow = [
      stage('cv_review', 'CV Review'),
      stage('hr_interview', 'HR Interview'),
      stage('hr_interview', 'HR Interview'),
      stage('custom', 'Portfolio Review'),
      stage('custom', ' portfolio review '),
      stage('final_decision', 'Final Decision'),
    ]

    expect(validateWorkflow(workflow)).toMatchObject({
      1: 'The same stage cannot be used twice.',
      2: 'The same stage cannot be used twice.',
      3: 'The same stage cannot be used twice.',
      4: 'The same stage cannot be used twice.',
    })
  })

  it('requires a name for custom stages', () => {
    const workflow = [stage('cv_review', 'CV Review'), stage('custom', '  '), stage('final_decision', 'Final Decision')]

    expect(validateWorkflow(workflow)[1]).toBe('Enter a name for this custom step.')
  })
})

describe('workflow editing', () => {
  it('adds an unused stage before Final Decision', () => {
    const result = addWorkflowStage(emptyWorkflow())

    expect(result.map(({ stage_type }) => stage_type)).toEqual(['cv_review', 'hr_screening', 'final_decision'])
  })

  it('moves and removes only middle stages', () => {
    const workflow = [
      stage('cv_review', 'CV Review'),
      stage('hr_screening', 'HR Screening'),
      stage('technical_interview', 'Technical Interview'),
      stage('final_decision', 'Final Decision'),
    ]

    expect(moveWorkflowStage(workflow, 2, -1).map(({ stage_type }) => stage_type)).toEqual([
      'cv_review', 'technical_interview', 'hr_screening', 'final_decision',
    ])
    expect(moveWorkflowStage(workflow, 1, -1)).toBe(workflow)
    expect(removeWorkflowStage(workflow, 1).map(({ stage_type }) => stage_type)).toEqual([
      'cv_review', 'technical_interview', 'final_decision',
    ])
    expect(removeWorkflowStage(workflow, 0)).toBe(workflow)
  })
})
