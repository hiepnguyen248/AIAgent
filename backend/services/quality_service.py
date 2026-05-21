"""
Quality Service - Multi-layer validation pipeline for generated Robot Framework scripts.
Validates: syntax, keyword existence, variable references, style compliance.
Provides a quality score 0-100.
"""
import re
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field


@dataclass
class ValidationIssue:
    """A single validation issue"""
    level: str  # "error", "warning", "info"
    category: str  # "syntax", "keyword", "variable", "style", "structure"
    message: str
    line: Optional[int] = None
    suggestion: Optional[str] = None


@dataclass
class QualityReport:
    """Complete quality report for a generated script"""
    score: int  # 0-100
    grade: str  # A, B, C, D, F
    issues: List[ValidationIssue] = field(default_factory=list)
    summary: Dict[str, int] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "score": self.score,
            "grade": self.grade,
            "issues": [
                {
                    "level": i.level,
                    "category": i.category,
                    "message": i.message,
                    "line": i.line,
                    "suggestion": i.suggestion,
                }
                for i in self.issues
            ],
            "summary": self.summary,
            "total_issues": len(self.issues),
            "errors": sum(1 for i in self.issues if i.level == "error"),
            "warnings": sum(1 for i in self.issues if i.level == "warning"),
        }


class QualityService:
    """Multi-layer validation pipeline for Robot Framework test scripts"""

    # Required sections for a complete .robot file
    REQUIRED_SECTIONS = ["*** Settings ***", "*** Test Cases ***"]
    OPTIONAL_SECTIONS = ["*** Variables ***", "*** Keywords ***", "*** Comments ***"]

    # Common Robot Framework built-in keywords (partial list for validation)
    BUILTIN_KEYWORDS = {
        "log", "log to console", "log many", "comment",
        "set variable", "set test variable", "set suite variable", "set global variable",
        "create list", "create dictionary",
        "should be equal", "should not be equal",
        "should be true", "should not be true",
        "should contain", "should not contain",
        "should be empty", "should not be empty",
        "should match", "should match regexp",
        "sleep", "wait until keyword succeeds",
        "run keyword", "run keyword if", "run keyword and return",
        "run keyword and ignore error", "run keyword and expect error",
        "run keyword and return status",
        "fail", "fatal error", "pass execution",
        "convert to string", "convert to integer", "convert to number",
        "get length", "get count",
        "evaluate", "call method",
        "import library", "import resource",
        "set tags", "remove tags",
        "no operation", "get time",
        "catenate", "get variable value",
        "variable should exist", "variable should not exist",
        "keyword should exist",
        "set log level", "get log level",
        "for", "end", "if", "else", "else if",
    }

    # Style rules
    MIN_DOC_LENGTH = 10
    MAX_LINE_LENGTH = 120
    EXPECTED_INDENT = "    "  # 4 spaces

    def validate(
        self,
        script: str,
        known_keywords: Optional[List[str]] = None,
        known_variables: Optional[List[str]] = None,
        known_resources: Optional[List[str]] = None,
    ) -> QualityReport:
        """Run full validation pipeline and return quality report"""
        issues: List[ValidationIssue] = []

        # Layer 1: Structure validation
        issues.extend(self._validate_structure(script))

        # Layer 2: Syntax validation
        issues.extend(self._validate_syntax(script))

        # Layer 3: Keyword existence check (if knowledge base provided)
        if known_keywords:
            issues.extend(self._validate_keywords(script, known_keywords))

        # Layer 4: Variable check
        issues.extend(self._validate_variables(script, known_variables))

        # Layer 5: Style compliance
        issues.extend(self._validate_style(script))

        # Calculate score
        score = self._calculate_score(issues, script)
        grade = self._score_to_grade(score)

        # Summary
        summary = {}
        for issue in issues:
            cat = issue.category
            summary[cat] = summary.get(cat, 0) + 1

        return QualityReport(
            score=score,
            grade=grade,
            issues=issues,
            summary=summary,
        )

    # =============================
    # Layer 1: Structure Validation
    # =============================

    def _validate_structure(self, script: str) -> List[ValidationIssue]:
        issues = []

        for section in self.REQUIRED_SECTIONS:
            if section not in script:
                issues.append(ValidationIssue(
                    level="error",
                    category="structure",
                    message=f"Missing required section: {section}",
                    suggestion=f"Add '{section}' to the script"
                ))

        # Check for at least one test case
        tc_section = re.search(
            r'\*\*\* Test Cases \*\*\*(.*?)(?=\*\*\*|\Z)',
            script, re.DOTALL
        )
        if tc_section:
            tc_content = tc_section.group(1).strip()
            # Test case names start at column 0
            tc_names = [
                line for line in tc_content.split('\n')
                if line.strip() and not line[0].isspace() and not line.startswith('#')
            ]
            if not tc_names:
                issues.append(ValidationIssue(
                    level="error",
                    category="structure",
                    message="*** Test Cases *** section is empty — no test cases defined",
                    suggestion="Add at least one test case"
                ))

        return issues

    # =============================
    # Layer 2: Syntax Validation
    # =============================

    def _validate_syntax(self, script: str) -> List[ValidationIssue]:
        issues = []
        lines = script.split('\n')
        in_section = None

        for i, line in enumerate(lines, 1):
            stripped = line.strip()

            # Track current section
            if stripped.startswith('***'):
                section_match = re.match(r'\*{3}\s+(\w[\w\s]*\w)\s+\*{3}', stripped)
                if section_match:
                    in_section = section_match.group(1)
                else:
                    issues.append(ValidationIssue(
                        level="warning",
                        category="syntax",
                        message=f"Malformed section header",
                        line=i,
                        suggestion="Use format: *** Section Name ***"
                    ))
                continue

            # Check for unclosed brackets
            if '[' in stripped:
                bracket_match = re.match(r'\s*\[(\w+)\]', stripped)
                if '[' in stripped and ']' not in stripped:
                    issues.append(ValidationIssue(
                        level="error",
                        category="syntax",
                        message=f"Unclosed bracket: {stripped[:50]}",
                        line=i,
                    ))

            # Check for tab characters (should use spaces)
            if '\t' in line:
                issues.append(ValidationIssue(
                    level="warning",
                    category="syntax",
                    message="Tab character found — Robot Framework prefers spaces",
                    line=i,
                    suggestion="Replace tabs with 4 spaces"
                ))

        return issues

    # =============================
    # Layer 3: Keyword Check
    # =============================

    def _validate_keywords(
        self, script: str, known_keywords: List[str]
    ) -> List[ValidationIssue]:
        """Check if used keywords exist in the knowledge base"""
        issues = []
        known_lower = {kw.lower().strip() for kw in known_keywords}
        known_lower.update(self.BUILTIN_KEYWORDS)

        lines = script.split('\n')
        in_test_or_keyword = False
        
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            
            # Track section context
            if stripped.startswith('***'):
                in_test_or_keyword = 'Test Cases' in stripped or 'Keywords' in stripped
                continue
            
            if not in_test_or_keyword:
                continue
            
            # Lines with indentation inside test/keyword body are potential keyword calls
            if line.startswith(self.EXPECTED_INDENT) and stripped:
                # Skip settings like [Documentation], [Tags], etc.
                if stripped.startswith('[') or stripped.startswith('#'):
                    continue
                
                # Skip control flow
                if stripped.upper().startswith(('FOR ', 'END', 'IF ', 'ELSE', 'WHILE ', 'TRY', 'EXCEPT')):
                    continue
                
                # Skip variable assignments: ${var}=  Keyword Name
                keyword_line = stripped
                if re.match(r'\$\{.+?\}\s*=\s*', keyword_line):
                    keyword_line = re.sub(r'\$\{.+?\}\s*=\s*', '', keyword_line).strip()
                
                if not keyword_line:
                    continue
                
                # Extract keyword name (first token separated by multiple spaces)
                kw_name = re.split(r'\s{2,}', keyword_line)[0].strip()
                
                # Skip if it looks like a variable
                if kw_name.startswith('$') or kw_name.startswith('@') or kw_name.startswith('%'):
                    continue
                
                # Check if keyword exists
                if kw_name.lower() not in known_lower:
                    issues.append(ValidationIssue(
                        level="warning",
                        category="keyword",
                        message=f"Keyword '{kw_name}' not found in knowledge base",
                        line=i,
                        suggestion="Verify this keyword exists in your framework libraries"
                    ))

        return issues

    # =============================
    # Layer 4: Variable Check
    # =============================

    def _validate_variables(
        self, script: str, known_variables: Optional[List[str]] = None
    ) -> List[ValidationIssue]:
        """Check for variable definition/usage consistency"""
        issues = []

        # Extract defined variables (in *** Variables *** section)
        defined_vars = set()
        var_section = re.search(
            r'\*\*\* Variables \*\*\*(.*?)(?=\*\*\*|\Z)',
            script, re.DOTALL
        )
        if var_section:
            for match in re.finditer(r'(\$\{[\w_]+\})', var_section.group(1)):
                defined_vars.add(match.group(1).lower())

        # Also add variables from [Arguments], Set Variable, etc.
        for match in re.finditer(r'\[Arguments\]\s+(.+)', script):
            for var in re.findall(r'(\$\{[\w_]+\})', match.group(1)):
                defined_vars.add(var.lower())

        # Add built-in variables
        builtin_vars = {
            '${true}', '${false}', '${none}', '${null}', '${empty}',
            '${space}', '${curdir}', '${tempdir}', '${execdir}',
            '${/}', '${:}', '${\\n}', '${log_level}',
            '${test_name}', '${test_status}', '${suite_name}',
            '${output_dir}', '${test_message}',
        }
        defined_vars.update(builtin_vars)

        # Add known variables from knowledge base
        if known_variables:
            for v in known_variables:
                defined_vars.add(v.lower())

        # Extract used variables in test body
        lines = script.split('\n')
        var_section_active = False
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if '*** Variables ***' in stripped:
                var_section_active = True
                continue
            elif stripped.startswith('***'):
                var_section_active = False
                continue

            # Don't check variable section itself
            if var_section_active:
                continue

            # Find all variable references
            used_vars = re.findall(r'(\$\{[\w_]+\})', line)
            for var in used_vars:
                if var.lower() not in defined_vars:
                    # Don't flag variables that are being assigned
                    if f'{var}=' in line.replace(' ', '') or f'{var} =' in line:
                        defined_vars.add(var.lower())
                        continue
                    # This is just an info since variables could come from resources
                    issues.append(ValidationIssue(
                        level="info",
                        category="variable",
                        message=f"Variable {var} not defined locally (may come from imported resource)",
                        line=i,
                    ))

        return issues

    # =============================
    # Layer 5: Style Compliance
    # =============================

    def _validate_style(self, script: str) -> List[ValidationIssue]:
        issues = []
        lines = script.split('\n')

        # Check for Documentation in test cases
        tc_section = re.search(
            r'\*\*\* Test Cases \*\*\*(.*?)(?=\*\*\*|\Z)',
            script, re.DOTALL
        )
        if tc_section:
            tc_content = tc_section.group(1)
            # Find test cases without [Documentation]
            tc_names = []
            current_tc_line = None
            has_doc = False

            for i, line in enumerate(tc_content.split('\n'), 1):
                if line.strip() and not line[0].isspace() and not line.startswith('#'):
                    if current_tc_line and not has_doc:
                        issues.append(ValidationIssue(
                            level="warning",
                            category="style",
                            message=f"Test case missing [Documentation]",
                            suggestion="Add [Documentation] to describe the test purpose"
                        ))
                    current_tc_line = line.strip()
                    has_doc = False
                elif '[Documentation]' in line:
                    has_doc = True

            if current_tc_line and not has_doc:
                issues.append(ValidationIssue(
                    level="warning",
                    category="style",
                    message=f"Test case missing [Documentation]",
                    suggestion="Add [Documentation] to describe the test purpose"
                ))

        # Check for [Tags]
        if '[Tags]' not in script:
            issues.append(ValidationIssue(
                level="info",
                category="style",
                message="No [Tags] found — tags help organize and filter tests",
                suggestion="Add [Tags] with relevant categories (e.g., CAN, HMI, smoke)"
            ))

        # Check Settings section for Documentation
        settings_section = re.search(
            r'\*\*\* Settings \*\*\*(.*?)(?=\*\*\*|\Z)',
            script, re.DOTALL
        )
        if settings_section:
            if 'Documentation' not in settings_section.group(1):
                issues.append(ValidationIssue(
                    level="warning",
                    category="style",
                    message="No suite-level Documentation in *** Settings ***",
                    suggestion="Add Documentation to describe the test suite purpose"
                ))

        # Check line length
        for i, line in enumerate(lines, 1):
            if len(line) > self.MAX_LINE_LENGTH:
                issues.append(ValidationIssue(
                    level="info",
                    category="style",
                    message=f"Line exceeds {self.MAX_LINE_LENGTH} chars ({len(line)} chars)",
                    line=i,
                    suggestion="Use '...' continuation for long lines"
                ))

        return issues

    # =============================
    # Scoring
    # =============================

    def _calculate_score(self, issues: List[ValidationIssue], script: str) -> int:
        """Calculate quality score 0-100"""
        score = 100

        for issue in issues:
            if issue.level == "error":
                score -= 15
            elif issue.level == "warning":
                score -= 5
            elif issue.level == "info":
                score -= 1

        # Bonus points for good practices
        if 'Suite Setup' in script or 'Suite Teardown' in script:
            score += 3
        if '[Setup]' in script or '[Teardown]' in script:
            score += 3
        if '[Tags]' in script:
            score += 2
        if 'Documentation' in script:
            score += 2

        return max(0, min(100, score))

    @staticmethod
    def _score_to_grade(score: int) -> str:
        if score >= 90:
            return "A"
        elif score >= 80:
            return "B"
        elif score >= 70:
            return "C"
        elif score >= 60:
            return "D"
        else:
            return "F"

    async def validate_with_rag(self, script: str) -> QualityReport:
        """Validate script using RAG knowledge base for keyword/variable checking"""
        known_keywords = []
        known_variables = []

        try:
            from services.rag_service import get_rag_service
            rag = get_rag_service()
            if rag:
                # Search for relevant keywords from knowledge base
                results = rag.search("Robot Framework keywords", top_k=50)
                for r in results:
                    if r.metadata.get('type') in ('robot', 'python_lib'):
                        item_name = r.metadata.get('item_name', '')
                        if item_name:
                            known_keywords.append(item_name)
                        # Also extract keyword names from content
                        for line in r.content.split('\n'):
                            if line.strip() and not line[0].isspace() and not line.startswith('*') and not line.startswith('#'):
                                known_keywords.append(line.strip())
        except Exception as e:
            print(f"[Quality] RAG lookup error: {e}")

        return self.validate(
            script,
            known_keywords=known_keywords if known_keywords else None,
            known_variables=known_variables if known_variables else None,
        )


# Singleton instance
quality_service = QualityService()
