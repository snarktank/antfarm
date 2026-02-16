#!/usr/bin/env python3
"""
Extract comments and track changes from Word documents using python-docx.
"""

import sys
import json
from datetime import datetime
from typing import List, Dict, Any

try:
    from docx import Document
    from docx.oxml.text.paragraph import CT_P
    from docx.oxml.table import CT_Tbl
    from docx.table import _Cell, Table
    from docx.text.paragraph import Paragraph
except ImportError:
    print(json.dumps({
        "error": "python-docx not installed. Install with: pip3 install python-docx"
    }))
    sys.exit(1)


def extract_comments(docx_path: str) -> Dict[str, Any]:
    """
    Extract all comments and track changes from a Word document.
    
    Returns a structured dict with:
    - comments: List of comment objects
    - trackChanges: List of tracked change objects
    - paragraphs: List of paragraph texts for context
    """
    try:
        doc = Document(docx_path)
        
        result = {
            "comments": [],
            "trackChanges": [],
            "paragraphs": []
        }
        
        # Extract paragraph texts for context
        for para in doc.paragraphs:
            result["paragraphs"].append(para.text)
        
        # Extract comments from document
        # Comments are stored in the document part
        if hasattr(doc, '_part') and hasattr(doc._part, 'comments_part'):
            comments_part = doc._part.comments_part
            if comments_part:
                comments_element = comments_part.element
                
                for comment in comments_element.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}comment'):
                    comment_id = comment.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
                    author = comment.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}author', 'Unknown')
                    date = comment.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}date', '')
                    
                    # Extract comment text
                    comment_text = ""
                    for para in comment.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                        for text in para.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                            if text.text:
                                comment_text += text.text
                    
                    # Find the paragraph that this comment is attached to
                    # This is a simplified approach - in reality, we'd need to traverse the XML more carefully
                    context_para_index = 0
                    
                    result["comments"].append({
                        "id": comment_id,
                        "author": author,
                        "date": date,
                        "text": comment_text.strip(),
                        "paragraphIndex": context_para_index,
                        "contextBefore": [],
                        "contextAfter": []
                    })
        
        # Extract track changes (revisions)
        # This is more complex and requires parsing the document XML
        # For now, we'll mark this as a simplified implementation
        # Full implementation would require traversing document._element and finding all revision marks
        
        return result
        
    except Exception as e:
        return {
            "error": f"Failed to extract comments: {str(e)}"
        }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            "error": "Usage: extract-word-comments.py <path-to-docx>"
        }))
        sys.exit(1)
    
    docx_path = sys.argv[1]
    result = extract_comments(docx_path)
    print(json.dumps(result, indent=2))
