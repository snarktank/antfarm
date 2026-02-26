# Script Class Processor Workflow

An Antfarm workflow for processing long transcript files (2-3 hours, 2000-3000 lines) into structured learning materials.

## Overview

The Script Class Processor workflow transforms lengthy video/webinar transcripts into comprehensive learning materials including:

- **Cleaned transcripts** with metadata extraction
- **Chunked analysis** for manageable content processing
- **Jump guides** with timestamp-based navigation
- **Structured notes** with key concepts and code examples
- **Practice quizzes** with Quick Check, Concept Check, and Scenario questions
- **Verification reports** ensuring quality and completeness

## Prerequisites

- Antfarm CLI installed and configured
- Access to the antfarm workflow system
- Transcript files in `.vtt` format

## Installation

```bash
# Install the workflow
antfarm workflow install script-class-processor

# Or from the repository
cd /home/ai/.openclaw/workspace/antfarm
antfarm workflow install script-class-processor
```

## Usage

Run the workflow with a session identifier:

```bash
antfarm workflow run script-class-processor "<session-identifier>"
```

### Example

```bash
antfarm workflow run script-class-processor "aws-s3-deep-dive-session-12"
```

The workflow will:
1. Locate the `.vtt` transcript file matching the session identifier
2. Process it through all 7 stages
3. Generate structured learning materials
4. Produce a verification report

## Input/Output Locations

### Expected Input

Place your transcript files in:
```
transcripts/raw/<session-identifier>.vtt
```

**Input format:** WebVTT (.vtt) files containing:
- Timestamps (HH:MM:SS.mmm format)
- Speaker identification (optional)
- Transcribed text content

### Output Files

All outputs are organized by session:

| Step | Output File | Location | Description |
|------|-------------|----------|-------------|
| 1. Detect | N/A | - | Session detection result |
| 2. Preprocess | `cleaned.txt` | `transcripts/cleaned/<session-id>/` | Clean text without timestamps |
| 2. Preprocess | `metadata.json` | `transcripts/metadata/<session-id>/` | Duration, speakers, line count |
| 3. Chunk | `chunk-analysis.json` | `analysis/<session-id>/` | Chunk boundaries and topics |
| 4. Jump Guide | `jump-guide.md` | `output/<session-id>/` | Timestamp navigation table |
| 5. Notes | `notes.md` | `output/<session-id>/` | Structured learning notes |
| 6. Quiz | `quiz.md` | `output/<session-id>/` | Practice questions |
| 7. Verify | `completion-report.json` | `reports/<session-id>/` | Validation results |

### Complete Output Structure

```
project/
├── transcripts/
│   ├── raw/
│   │   └── <session-id>.vtt          # Input transcript
│   ├── cleaned/
│   │   └── <session-id>/
│   │       └── cleaned.txt           # Cleaned text
│   └── metadata/
│       └── <session-id>/
│           └── metadata.json         # Duration, speakers, etc.
├── analysis/
│   └── <session-id>/
│       └── chunk-analysis.json       # Chunk boundaries
├── output/
│   └── <session-id>/
│       ├── jump-guide.md             # Timestamp navigation
│       ├── notes.md                  # Learning notes
│       └── quiz.md                   # Practice quiz
└── reports/
    └── <session-id>/
        └── completion-report.json    # Validation report
```

## Workflow Steps

The workflow consists of 7 sequential steps:

### Step 1: Detect (`file-watcher`)
**Agent:** File Watcher (coding role)

Detects the transcript file based on the session identifier provided.

**Inputs:**
- Task: Session identifier from command line

**Outputs:**
- `session_id`: Session identifier extracted from filename
- `file_path`: Full path to the detected transcript file

---

### Step 2: Preprocess (`transcript-cleaner`)
**Agent:** Transcript Cleaner (coding role)

Parses the VTT file to extract clean text and metadata.

**Inputs:**
- `session_id`: From Step 1
- `file_path`: From Step 1

**Processing:**
- Removes timestamps and headers
- Strips formatting artifacts
- Extracts speaker information
- Generates metadata (duration, line count)

**Outputs:**
- `cleaned_path`: Path to cleaned transcript
- `metadata_path`: Path to metadata JSON

---

### Step 3: Chunk (`chunk-analyzer`)
**Agent:** Chunk Analyzer (analysis role)

Splits the cleaned transcript into semantically coherent chunks.

**Inputs:**
- `cleaned_path`: From Step 2
- `metadata_path`: From Step 2

**Processing:**
- Creates chunks of ~5 minutes each (200-300 lines)
- Builds cumulative topic index across chunks
- Tracks topics for sequential processing

**Outputs:**
- `chunk_analysis_path`: Path to chunk analysis JSON

---

### Step 4: Jump Guide (`jump-guide-generator`)
**Agent:** Jump Guide Generator (coding role)

Creates timestamp-based navigation tables.

**Inputs:**
- `chunk_analysis_path`: From Step 3

**Processing:**
- Identifies topic transitions
- Maps code demonstrations
- Notes exam tips and Q&A sections
- Formats timestamps as HH:MM:SS

**Outputs:**
- `jump_guide_path`: Path to jump guide markdown

---

### Step 5: Notes (`notes-generator`)
**Agent:** Notes Generator (coding role)

Produces structured learning notes.

**Inputs:**
- `cleaned_path`: From Step 2
- `jump_guide_path`: From Step 4

**Processing:**
- Generates session summary
- Extracts key concepts with explanations
- Formats code examples with syntax highlighting
- Adds exam tips and cross-references

**Outputs:**
- `notes_path`: Path to notes markdown

---

### Step 6: Quiz (`quiz-generator`)
**Agent:** Quiz Generator (coding role)

Creates comprehensive practice questions.

**Inputs:**
- `notes_path`: From Step 5

**Processing:**
- Quick Check: 5 basic recall questions
- Concept Check: 5 understanding questions
- Scenario Practice: 3 real-world scenarios
- Flashcards: Key terms and definitions

**Outputs:**
- `quiz_path`: Path to quiz markdown

---

### Step 7: Verify (`verification-agent`)
**Agent:** Verification Agent (verification role)

Validates all outputs and generates a completion report.

**Inputs:**
- `chunk_analysis_path`: From Step 3
- `jump_guide_path`: From Step 4
- `notes_path`: From Step 5
- `quiz_path`: From Step 6

**Processing:**
- Verifies file existence and non-empty content
- Checks format compliance
- Validates timestamp formats (HH:MM:SS)
- Confirms quiz completeness
- Generates detailed validation report

**Outputs:**
- `completion_report_path`: Path to completion report JSON

**On Failure:**
- Escalates to human for manual review

---

## Configuration

### Polling Settings

The workflow uses the following polling configuration:

| Setting | Value | Description |
|---------|-------|-------------|
| Model | `default` | LLM model for agent processing |
| Timeout | 1800 seconds (30 minutes) | Maximum time for transcript processing |

### Why 30 Minutes?

Long transcripts (2000-3000 lines) require significant processing time:
- Chunk analysis and topic extraction
- Multi-pass content generation
- Verification across all outputs

If your transcripts are shorter, processing will complete faster.

## Troubleshooting

### Common Issues

#### Issue: "No transcript file found"
**Symptoms:** File-watcher agent fails to locate the transcript

**Solutions:**
1. Verify the file exists: `ls transcripts/raw/<session-id>.vtt`
2. Check file naming matches the session identifier exactly
3. Ensure the file has `.vtt` extension (not `.txt` or `.srt`)
4. Confirm file permissions: `chmod 644 transcripts/raw/<session-id>.vtt`

#### Issue: "VTT parse errors"
**Symptoms:** Transcript-cleaner fails with parsing errors

**Solutions:**
1. Validate VTT format:
   - File must start with `WEBVTT` header
   - Timestamps must use `HH:MM:SS.mmm` format
   - Cues must be separated by blank lines
2. Check for encoding issues (should be UTF-8)
3. Remove any BOM (Byte Order Mark) if present:
   ```bash
   sed -i '1s/^\xEF\xBB\xBF//' transcripts/raw/<session-id>.vtt
   ```

#### Issue: "Chunks too large/small"
**Symptoms:** Chunk analysis produces uneven or inappropriate chunk sizes

**Solutions:**
1. Check line count in metadata: `cat transcripts/metadata/<session-id>/metadata.json`
2. For very short transcripts (< 500 lines), chunks may be merged
3. For transcripts without clear topic breaks, semantic chunking may vary
4. Manually review `chunk-analysis.json` to verify boundaries

#### Issue: "Invalid timestamp format"
**Symptoms:** Jump guide has malformed timestamps

**Solutions:**
1. Verify source VTT timestamps use consistent format
2. Check for timestamps exceeding content duration
3. Ensure all timestamps follow `HH:MM:SS` format (not `MM:SS`)
4. Regenerate by running only steps 4-7 if needed

#### Issue: "Quiz generation incomplete"
**Symptoms:** Quiz missing sections (Quick Check, Concept Check, etc.)

**Solutions:**
1. Verify notes file exists and has sufficient content
2. Check notes cover multiple distinct topics (quiz diversity depends on content)
3. Review `completion-report.json` for specific missing sections
4. Re-run from step 5 if notes need regeneration

#### Issue: "Verification failed"
**Symptoms:** Verification agent reports validation errors

**Solutions:**
1. Review `completion-report.json` for specific failures
2. Common failure causes:
   - Missing output files (check disk space)
   - Empty files (processing may have failed silently)
   - Malformed JSON in intermediate files
   - Invalid timestamp formats
3. Fix underlying issue and re-run workflow
4. If issue persists, workflow escalates to human for review

#### Issue: "Workflow timeout"
**Symptoms:** Workflow exceeds 30-minute timeout

**Solutions:**
1. Check transcript size (extremely large files may need splitting)
2. Verify system resources (CPU/memory) are available
3. Run workflow during off-peak hours if shared system
4. Consider splitting very long transcripts manually:
   ```bash
   # Split by time segments
   head -n 1500 transcripts/raw/<session-id>.vtt > part1.vtt
   tail -n +1501 transcripts/raw/<session-id>.vtt > part2.vtt
   ```

### Debug Mode

To see detailed agent outputs:

```bash
antfarm workflow run script-class-processor "<session-id>" --verbose
```

### Logs Location

Agent execution logs are stored in:
```
logs/script-class-processor/<run-id>/
```

### Getting Help

1. Check the completion report: `reports/<session-id>/completion-report.json`
2. Review agent logs for specific step failures
3. File an issue with the session ID and error details

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Script Class Processor                        │
│                     (30 min timeout)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   Phase 1               Phase 2               Phase 3
Detection/          Content Generation     Verification/
Preprocessing                              Completion
        │                     │                     │
   ┌─────────┐          ┌─────────────┐       ┌────────────┐
   │ 1.      │          │ 4. Jump     │       │ 7. Verify  │
   │ Detect  │─────────▶│    Guide    │──────▶│  (human    │
   └────┬────┘          └──────┬──────┘       │  fallback) │
        │                      │              └────────────┘
   ┌────▼────┐          ┌──────▼──────┐
   │ 2.      │          │ 5. Notes    │
   │Preprocess│─────────▶│             │
   └────┬────┘          └──────┬──────┘
        │                      │
   ┌────▼────┐          ┌──────▼──────┐
   │ 3.      │          │ 6. Quiz     │
   │ Chunk   │─────────▶│             │
   └─────────┘          └─────────────┘
```

## Contributing

To modify the workflow:

1. Edit `workflow.yml` for step/agent changes
2. Update agent definitions in `agents/<agent-id>/`
3. Run tests: `node --test tests/script-class-processor-*.test.ts`
4. Typecheck: `npm run build`
5. Commit changes with clear message

## License

Part of the Antfarm workflow system.
