"""
Markdown Service - Parse markdown documentation files for test resources
Extracts: prompts, libraries, resources, keywords, code blocks
"""
import re
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field


@dataclass
class ParsedMarkdown:
    """Result of parsing a markdown document for test resources"""
    prompts: List[str] = field(default_factory=list)
    libraries: List[str] = field(default_factory=list)
    resources: List[str] = field(default_factory=list)
    keywords: List[Dict[str, str]] = field(default_factory=list)
    code_blocks: List[Dict[str, str]] = field(default_factory=list)
    sections: List[Dict[str, str]] = field(default_factory=list)


class MarkdownService:
    """Service for parsing markdown documentation files"""

    # Patterns for extracting test-related content
    ROBOT_KEYWORD_PATTERN = re.compile(
        r'^\s{4}(\S.+?)$\s+\[Documentation\]\s+(.+?)$',
        re.MULTILINE
    )
    LIBRARY_PATTERN = re.compile(
        r'Library\s+(\S+)',
        re.MULTILINE
    )
    RESOURCE_PATTERN = re.compile(
        r'Resource\s+(\S+)',
        re.MULTILINE
    )
    CODE_BLOCK_PATTERN = re.compile(
        r'```(\w*)\n(.*?)```',
        re.DOTALL
    )

    def load_content(self, content: str, source_name: str = "unknown") -> Dict[str, Any]:
        """Parse markdown content and extract test-relevant information"""
        result = ParsedMarkdown()

        # Extract code blocks
        for match in self.CODE_BLOCK_PATTERN.finditer(content):
            lang = match.group(1) or "text"
            code = match.group(2).strip()
            result.code_blocks.append({
                "language": lang,
                "content": code,
                "source": source_name
            })

            # Parse robot code blocks for keywords and imports
            if lang.lower() in ("robot", "robotframework", "rf"):
                self._extract_robot_elements(code, result)

        # Extract sections
        sections = re.split(r'\n(?=#{1,3}\s)', content)
        for section in sections:
            header_match = re.match(r'^(#{1,3})\s+(.+)', section)
            if header_match:
                result.sections.append({
                    "level": len(header_match.group(1)),
                    "title": header_match.group(2).strip(),
                    "content": section.strip()
                })

        # Look for prompt-like content (quoted blocks or specific patterns)
        prompt_pattern = re.compile(r'>\s*(?:Prompt|System|Instructions?):\s*(.+?)(?:\n(?!>)|\Z)', re.DOTALL)
        for match in prompt_pattern.finditer(content):
            result.prompts.append(match.group(1).strip())

        # Also extract blockquotes as potential prompts
        blockquote_pattern = re.compile(r'^>\s+(.+)$', re.MULTILINE)
        for match in blockquote_pattern.finditer(content):
            text = match.group(1).strip()
            if len(text) > 20 and text not in result.prompts:
                result.prompts.append(text)

        return {
            "prompts": result.prompts,
            "libraries": list(set(result.libraries)),
            "resources": list(set(result.resources)),
            "keywords": result.keywords,
            "code_blocks": result.code_blocks,
            "sections": result.sections,
            "source": source_name
        }

    def _extract_robot_elements(self, code: str, result: ParsedMarkdown):
        """Extract Robot Framework elements from a code block"""
        # Extract Library imports
        for match in self.LIBRARY_PATTERN.finditer(code):
            result.libraries.append(match.group(1))

        # Extract Resource imports
        for match in self.RESOURCE_PATTERN.finditer(code):
            result.resources.append(match.group(1))

        # Extract keywords (lines at column 0 under *** Keywords ***)
        in_keywords_section = False
        current_keyword = None
        current_doc = None

        for line in code.split('\n'):
            stripped = line.strip()
            if '*** Keywords ***' in stripped:
                in_keywords_section = True
                continue
            elif stripped.startswith('***'):
                in_keywords_section = False
                # Save last keyword
                if current_keyword:
                    result.keywords.append({
                        "name": current_keyword,
                        "documentation": current_doc or ""
                    })
                    current_keyword = None
                    current_doc = None
                continue

            if in_keywords_section:
                if line and not line[0].isspace() and stripped and not stripped.startswith('#'):
                    # Save previous keyword
                    if current_keyword:
                        result.keywords.append({
                            "name": current_keyword,
                            "documentation": current_doc or ""
                        })
                    current_keyword = stripped
                    current_doc = None
                elif stripped.startswith('[Documentation]'):
                    current_doc = stripped.replace('[Documentation]', '').strip()

        # Save last keyword
        if current_keyword:
            result.keywords.append({
                "name": current_keyword,
                "documentation": current_doc or ""
            })

    def extract_test_patterns(self, content: str) -> List[Dict[str, str]]:
        """Extract test patterns from markdown (useful for few-shot examples)"""
        patterns = []
        for block in self.CODE_BLOCK_PATTERN.finditer(content):
            lang = block.group(1) or ""
            code = block.group(2).strip()
            if lang.lower() in ("robot", "robotframework", "rf") and '*** Test Cases ***' in code:
                # Extract test case name
                tc_match = re.search(r'\*\*\* Test Cases \*\*\*\s*\n(\S.+)', code)
                tc_name = tc_match.group(1).strip() if tc_match else "Unknown"
                patterns.append({
                    "name": tc_name,
                    "code": code,
                    "language": "robot"
                })
        return patterns


# Singleton instance
markdown_service = MarkdownService()
