"""
Deep Generation Service - Multi-step reasoning pipeline for higher quality output.
Steps: Analyze → Plan → Generate → Self-Review → Refine
"""
import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class DeepResult:
    """Result from deep generation pipeline"""
    output: str
    analysis: str = ""
    plan: str = ""
    review: str = ""
    steps_completed: int = 0
    quality_improved: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "output": self.output,
            "analysis": self.analysis,
            "plan": self.plan,
            "review": self.review,
            "steps_completed": self.steps_completed,
            "quality_improved": self.quality_improved,
        }


class DeepGenerationService:
    """Multi-step generation pipeline for higher quality output"""

    ANALYZE_PROMPT = """Analyze the following input and extract key elements for test generation.
Identify:
1. Test objective / requirement being tested
2. System Under Test (SUT) components
3. Communication protocols involved (CAN, UART, DLT, HMI, etc.)
4. Input conditions and triggers
5. Expected outcomes / pass criteria
6. Edge cases and error scenarios

Input:
{input_text}

{rag_context}

Provide a structured analysis. Be concise."""

    PLAN_PROMPT = """Based on this analysis, plan the test script structure:

Analysis:
{analysis}

Create a test plan with:
1. Suite name and documentation
2. Required Libraries and Resources
3. Variables needed (with default values)
4. Test case names and descriptions
5. Keywords to use (from available framework, if provided)
6. Setup/Teardown requirements

Output a structured plan. Be specific about keyword names and arguments."""

    REVIEW_PROMPT = """Review this generated Robot Framework test script for quality:

{generated_code}

Check for:
1. Syntax correctness (RF format)
2. Missing sections (Settings, Variables, Test Cases)
3. Missing [Documentation] or [Tags]
4. Undefined keywords (not imported)
5. Undefined variables (not declared)
6. Missing error handling ([Teardown])
7. Logic errors in test steps

List specific issues and suggested fixes. If the script is good, say "PASS: No critical issues found."
"""

    REFINE_PROMPT = """Fix the following issues in this Robot Framework test script:

Original script:
{generated_code}

Issues found:
{review_feedback}

Generate the corrected script. Output ONLY the corrected Robot Framework code, no explanations."""

    async def generate_deep(
        self,
        input_text: str,
        mode: str = "test_script",
        rag_context: str = "",
    ) -> DeepResult:
        """Run the full deep generation pipeline"""
        from services.llm_service import llm_service

        result = DeepResult(output="", steps_completed=0)

        # Step 1: Analyze
        try:
            analyze_prompt = self.ANALYZE_PROMPT.format(
                input_text=input_text,
                rag_context=f"\nAvailable Framework Context:\n{rag_context}" if rag_context else ""
            )
            analysis = await llm_service.chat([
                {"role": "system", "content": "You are an expert test analyst for automotive embedded systems."},
                {"role": "user", "content": analyze_prompt}
            ])
            result.analysis = analysis
            result.steps_completed = 1
        except Exception as e:
            result.output = f"Analysis failed: {e}"
            return result

        # Step 2: Plan
        try:
            plan_prompt = self.PLAN_PROMPT.format(analysis=analysis)
            plan = await llm_service.chat([
                {"role": "system", "content": "You are an expert Robot Framework test architect."},
                {"role": "user", "content": plan_prompt}
            ])
            result.plan = plan
            result.steps_completed = 2
        except Exception as e:
            result.output = f"Planning failed: {e}"
            return result

        # Step 3: Generate
        try:
            if mode == "req_tc":
                gen_system = """You are an expert test case designer. Generate structured test cases as a table:
| TC ID | Test Case Name | Precondition | Test Steps | Expected Result | Priority |
Generate comprehensive test cases covering normal flows, edge cases, and error scenarios.
Output as a well-formatted markdown table."""
            else:
                gen_system = """You are an expert Robot Framework test automation engineer.
Generate a complete, production-ready .robot file.
Output ONLY the Robot Framework code. No markdown fences, no explanations."""

            gen_prompt = f"""Based on this analysis and plan, generate the output:

Analysis:
{analysis}

Plan:
{plan}

{f'Available Framework Context: {rag_context}' if rag_context else ''}

Generate now:"""

            generated = await llm_service.chat([
                {"role": "system", "content": gen_system},
                {"role": "user", "content": gen_prompt}
            ])
            result.output = generated
            result.steps_completed = 3
        except Exception as e:
            result.output = f"Generation failed: {e}"
            return result

        # Step 4: Self-Review (only for test_script mode)
        if mode == "test_script":
            try:
                review_prompt = self.REVIEW_PROMPT.format(generated_code=generated)
                review = await llm_service.chat([
                    {"role": "system", "content": "You are a Robot Framework code reviewer. Be specific and concise."},
                    {"role": "user", "content": review_prompt}
                ])
                result.review = review
                result.steps_completed = 4

                # Step 5: Refine if issues found
                if "PASS" not in review[:50].upper():
                    refine_prompt = self.REFINE_PROMPT.format(
                        generated_code=generated,
                        review_feedback=review
                    )
                    refined = await llm_service.chat([
                        {"role": "system", "content": "You are an expert Robot Framework engineer. Fix code issues precisely."},
                        {"role": "user", "content": refine_prompt}
                    ])
                    # Clean markdown fences
                    refined = refined.strip()
                    if refined.startswith("```"):
                        lines = refined.split('\n')
                        if lines[0].startswith("```"):
                            lines = lines[1:]
                        if lines and lines[-1].strip() == "```":
                            lines = lines[:-1]
                        refined = '\n'.join(lines)
                    
                    result.output = refined
                    result.quality_improved = True
                    result.steps_completed = 5
                else:
                    result.steps_completed = 5
            except Exception as e:
                # Review/refine failed, but we still have the generated output
                result.review = f"Review failed: {e}"
                result.steps_completed = 4
        else:
            result.steps_completed = 5

        return result


# Singleton
deep_service = DeepGenerationService()
