"""
Pydantic Output Schemas for Structured LLM Responses
Provides type-safe, validated response models for all agent outputs.
"""
from __future__ import annotations

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────────────────────────────────────

class Priority(str, Enum):
    critical = "Critical"
    high = "High"
    medium = "Medium"
    low = "Low"


class ReviewSeverity(str, Enum):
    critical = "critical"
    improvement = "improvement"
    good = "good"


# ──────────────────────────────────────────────────────────────────────────────
# Test Case Table (req_tc agent)
# ──────────────────────────────────────────────────────────────────────────────

class TestCaseRow(BaseModel):
    """A single structured test case row."""

    tc_id: str = Field(..., description="Test case identifier, e.g. TC-001")
    name: str = Field(..., description="Short, descriptive test case name")
    precondition: str = Field(..., description="Required preconditions before test execution")
    test_steps: List[str] = Field(..., description="Ordered list of test execution steps")
    expected_result: str = Field(..., description="Specific, measurable expected outcome")
    priority: Priority = Field(Priority.medium, description="Test priority level")


class TestCaseTableOutput(BaseModel):
    """Structured output for requirement → test case generation."""

    requirement_summary: str = Field(..., description="Brief summary of the analysed requirement")
    test_cases: List[TestCaseRow] = Field(..., description="Generated test cases")
    coverage_notes: Optional[str] = Field(None, description="Notes on coverage gaps or assumptions")


# ──────────────────────────────────────────────────────────────────────────────
# Robot Framework Generation (test_generator agent)
# ──────────────────────────────────────────────────────────────────────────────

class RobotKeywordUsage(BaseModel):
    """A Robot Framework keyword call within a test case."""

    keyword: str = Field(..., description="Keyword name exactly as used in the .robot file")
    arguments: List[str] = Field(default_factory=list, description="Arguments passed to the keyword")
    comment: Optional[str] = Field(None, description="Optional inline comment explaining this step")


class RobotTestCase(BaseModel):
    """A single Robot Framework test case."""

    name: str = Field(..., description="Test case name")
    documentation: str = Field(..., description="[Documentation] tag content")
    tags: List[str] = Field(default_factory=list, description="[Tags] values")
    setup: Optional[str] = Field(None, description="[Setup] keyword call if any")
    teardown: Optional[str] = Field(None, description="[Teardown] keyword call if any")
    steps: List[RobotKeywordUsage] = Field(..., description="Ordered keyword steps")


class RobotTestOutput(BaseModel):
    """Full Robot Framework .robot file output — structured."""

    suite_name: str = Field(..., description="Suite/file name without extension")
    suite_documentation: str = Field(..., description="Suite-level documentation")
    libraries: List[str] = Field(default_factory=list, description="Library imports")
    resources: List[str] = Field(default_factory=list, description="Resource file imports")
    variables: dict = Field(default_factory=dict, description="Suite-level variables (name → value)")
    test_cases: List[RobotTestCase] = Field(..., description="All test cases in the suite")
    robot_code: str = Field(..., description="The complete rendered .robot file content")


# ──────────────────────────────────────────────────────────────────────────────
# Test Review (test_reviewer agent)
# ──────────────────────────────────────────────────────────────────────────────

class ReviewIssue(BaseModel):
    """A single review finding."""

    severity: ReviewSeverity = Field(..., description="Issue severity level")
    line_hint: Optional[str] = Field(None, description="Approximate line or keyword reference")
    description: str = Field(..., description="Clear description of the issue or positive finding")
    suggestion: Optional[str] = Field(None, description="Suggested fix or improvement")


class ReviewOutput(BaseModel):
    """Structured code review output."""

    overall_score: int = Field(..., ge=0, le=10, description="Overall quality score 0–10")
    summary: str = Field(..., description="Brief overall assessment")
    issues: List[ReviewIssue] = Field(default_factory=list, description="All review findings")
    improved_code: Optional[str] = Field(None, description="Improved version of the test code if applicable")


# ──────────────────────────────────────────────────────────────────────────────
# RAG Search (chat agent)
# ──────────────────────────────────────────────────────────────────────────────

class RAGSearchResult(BaseModel):
    """A single RAG knowledge base result used in the response."""

    source: str = Field(..., description="Document source name")
    relevance: float = Field(..., ge=0.0, le=1.0, description="Relevance score 0.0–1.0")
    excerpt: str = Field(..., description="Key excerpt from the document")


class RAGSearchOutput(BaseModel):
    """Structured chat response with RAG citations."""

    answer: str = Field(..., description="Complete answer to the user's question")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence level 0.0–1.0")
    sources_used: List[RAGSearchResult] = Field(default_factory=list, description="Knowledge base sources used")
    follow_up_suggestions: List[str] = Field(default_factory=list, description="Suggested follow-up questions")
