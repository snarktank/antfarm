import type { UnifiedComment } from './document-router.js';

export type FeedbackCategory = 'factual_error' | 'missing_info' | 'tone' | 'structure';
export type Priority = 'high' | 'medium' | 'low';

export interface CategorizedFeedback {
  originalComment: UnifiedComment;
  category: FeedbackCategory;
  priority: Priority;
  reasoning: string;
}

/**
 * Categorizes feedback into one of four categories and assigns priority.
 * Uses keyword analysis and pattern matching to determine category.
 * Defaults to most conservative category when ambiguous.
 */
export function categorizeFeedback(comments: UnifiedComment[]): CategorizedFeedback[] {
  return comments.map(comment => {
    const text = comment.text.toLowerCase();
    
    // Determine category based on keywords and patterns
    const category = determineCategory(text);
    
    // Determine priority based on category and severity indicators
    const priority = determinePriority(text, category);
    
    // Generate reasoning for the categorization
    const reasoning = generateReasoning(text, category, priority);
    
    return {
      originalComment: comment,
      category,
      priority,
      reasoning
    };
  });
}

/**
 * Determines the feedback category based on keyword analysis.
 * Returns most conservative category when ambiguous.
 */
function determineCategory(text: string): FeedbackCategory {
  // Factual error indicators (highest priority check)
  const factualIndicators = [
    'incorrect', 'wrong', 'inaccurate', 'false', 'error', 'mistake',
    'not true', 'invalid', 'outdated', 'obsolete', 'verify',
    'check this', 'citation needed', 'source?'
  ];
  
  // Missing info indicators
  const missingInfoIndicators = [
    'missing', 'add', 'include', 'need', 'should explain',
    'expand on', 'more detail', 'clarify', 'what about',
    'consider adding', 'elaborate', 'provide example'
  ];
  
  // Tone indicators
  const toneIndicators = [
    'tone', 'sounds', 'comes across', 'feels', 'too formal',
    'too casual', 'aggressive', 'passive', 'confusing',
    'unclear', 'wordy', 'repetitive', 'awkward phrasing'
  ];
  
  // Structure indicators
  const structureIndicators = [
    'structure', 'organize', 'reorder', 'move this',
    'section', 'heading', 'format', 'layout', 'flow',
    'break up', 'combine', 'split', 'rearrange'
  ];
  
  // Check each category (factual_error first as it's most critical)
  if (factualIndicators.some(indicator => text.includes(indicator))) {
    return 'factual_error';
  }
  
  if (missingInfoIndicators.some(indicator => text.includes(indicator))) {
    return 'missing_info';
  }
  
  if (toneIndicators.some(indicator => text.includes(indicator))) {
    return 'tone';
  }
  
  if (structureIndicators.some(indicator => text.includes(indicator))) {
    return 'structure';
  }
  
  // Default to most conservative category: factual_error
  // (Better to treat ambiguous feedback as potentially critical)
  return 'factual_error';
}

/**
 * Determines priority based on category and severity indicators.
 */
function determinePriority(text: string, category: FeedbackCategory): Priority {
  // High priority indicators
  const highPriorityIndicators = [
    'critical', 'must', 'required', 'urgent', 'important',
    'blocking', 'serious', 'major'
  ];
  
  // Low priority indicators
  const lowPriorityIndicators = [
    'minor', 'nit', 'optional', 'consider', 'might',
    'could', 'suggestion', 'nice to have'
  ];
  
  // Check for explicit priority indicators
  if (highPriorityIndicators.some(indicator => text.includes(indicator))) {
    return 'high';
  }
  
  if (lowPriorityIndicators.some(indicator => text.includes(indicator))) {
    return 'low';
  }
  
  // Category-based defaults
  switch (category) {
    case 'factual_error':
      // Factual errors are high priority by default
      return 'high';
    case 'missing_info':
      // Missing info is medium priority by default
      return 'medium';
    case 'tone':
      // Tone issues are low priority by default
      return 'low';
    case 'structure':
      // Structure changes are medium priority by default
      return 'medium';
  }
}

/**
 * Generates human-readable reasoning for the categorization.
 */
function generateReasoning(text: string, category: FeedbackCategory, priority: Priority): string {
  const categoryReasons: Record<FeedbackCategory, string> = {
    factual_error: 'Contains indicators of factual inaccuracy or verification needed',
    missing_info: 'Requests additional information or elaboration',
    tone: 'Addresses writing style, clarity, or voice',
    structure: 'Suggests organizational or formatting changes'
  };
  
  const priorityReasons: Record<Priority, string> = {
    high: 'critical to document accuracy or completeness',
    medium: 'improves document quality but not blocking',
    low: 'minor suggestion or nice-to-have improvement'
  };
  
  return `${categoryReasons[category]}. Priority ${priority} because it's ${priorityReasons[priority]}.`;
}
