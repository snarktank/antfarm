/**
 * TypeScript types for the Ops Intelligence Module
 * Defines database schema interfaces for ops analysis
 */

/**
 * Ops Analysis Run - tracks one complete analysis execution
 */
export interface OpsAnalysisRun {
  id: string;
  run_id: string;
  analyzed_at: string;
  pattern_count: number;
  finding_count: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

/**
 * Ops Pattern - detected recurring patterns in operations
 */
export interface OpsPattern {
  id: string;
  analysis_id: string;
  pattern_type: string;
  description: string;
  occurrence_count: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  first_seen: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

/**
 * Ops Finding - a specific finding from analysis
 */
export interface OpsFinding {
  id: string;
  analysis_id: string;
  finding_type: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  entity_type: string;
  entity_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Ops Recommendation - actionable recommendation for an issue
 */
export interface OpsRecommendation {
  id: string;
  finding_id: string;
  recommendation_text: string;
  priority: 'high' | 'medium' | 'low';
  effort_level: 'high' | 'medium' | 'low';
  created_at: string;
  updated_at: string;
}
