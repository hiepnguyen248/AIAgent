"""
Markdown Service - Parse .md files for prompts and automation resources
"""
import re
from typing import Dict, List, Any, Optional
from pathlib import Path


class MarkdownParser:
    """Parse markdown files to extract prompts and resources"""
    
    def __init__(self):
        self.section_pattern = re.compile(r'^#{1,3}\s+(.+)$', re.MULTILINE)
        self.code_block_pattern = re.compile(r'```(\w+)?\n(.*?)```', re.DOTALL)
    
    def parse_file(self, file_path: str) -> Dict[str, Any]:
        """Parse a markdown file"""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        content = path.read_text(encoding='utf-8')
        return self.parse_content(content)
    
    def parse_content(self, content: str) -> Dict[str, Any]:
        """Parse markdown content"""
        result = {
            'prompts': [],
            'libraries': [],
            'resources': [],
            'keywords': [],
            'sections': {}
        }
        
        # Split by sections
        sections = self._split_sections(content)
        result['sections'] = sections
        
        # Extract specific content
        for section_name, section_content in sections.items():
            lower_name = section_name.lower()
            
            if 'prompt' in lower_name:
                result['prompts'].append({
                    'name': section_name,
                    'content': section_content.strip()
                })
            elif 'library' in lower_name or 'libraries' in lower_name:
                result['libraries'].extend(self._extract_list_items(section_content))
            elif 'resource' in lower_name:
                result['resources'].extend(self._extract_list_items(section_content))
            elif 'keyword' in lower_name:
                result['keywords'].extend(self._extract_keywords(section_content))
        
        # Extract code blocks
        result['code_blocks'] = self._extract_code_blocks(content)
        
        return result
    
    def _split_sections(self, content: str) -> Dict[str, str]:
        """Split content by headers"""
        sections = {}
        lines = content.split('\n')
        current_section = 'Introduction'
        current_content = []
        
        for line in lines:
            header_match = self.section_pattern.match(line)
            if header_match:
                if current_content:
                    sections[current_section] = '\n'.join(current_content)
                current_section = header_match.group(1).strip()
                current_content = []
            else:
                current_content.append(line)
        
        if current_content:
            sections[current_section] = '\n'.join(current_content)
        
        return sections
    
    def _extract_list_items(self, content: str) -> List[str]:
        """Extract list items from content"""
        items = []
        pattern = re.compile(r'^[\s]*[-*]\s+(.+)$', re.MULTILINE)
        for match in pattern.finditer(content):
            items.append(match.group(1).strip())
        return items
    
    def _extract_keywords(self, content: str) -> List[Dict[str, str]]:
        """Extract Robot Framework keywords from content"""
        keywords = []
        code_blocks = self._extract_code_blocks(content)
        
        for block in code_blocks:
            if block['language'] in ('robot', 'robotframework', ''):
                # Parse keyword definitions
                lines = block['code'].split('\n')
                current_keyword = None
                current_doc = []
                
                for line in lines:
                    if line and not line.startswith(' ') and not line.startswith('\t'):
                        if current_keyword:
                            keywords.append({
                                'name': current_keyword,
                                'documentation': '\n'.join(current_doc)
                            })
                        current_keyword = line.strip()
                        current_doc = []
                    elif line.strip().startswith('[Documentation]'):
                        current_doc.append(line.split('[Documentation]')[1].strip())
                
                if current_keyword:
                    keywords.append({
                        'name': current_keyword,
                        'documentation': '\n'.join(current_doc)
                    })
        
        return keywords
    
    def _extract_code_blocks(self, content: str) -> List[Dict[str, str]]:
        """Extract code blocks from content"""
        blocks = []
        for match in self.code_block_pattern.finditer(content):
            blocks.append({
                'language': match.group(1) or '',
                'code': match.group(2).strip()
            })
        return blocks


class MarkdownService:
    """Service for managing markdown files"""
    
    def __init__(self):
        self.parser = MarkdownParser()
        self.loaded_files: Dict[str, Dict[str, Any]] = {}
    
    def load_file(self, file_path: str) -> Dict[str, Any]:
        """Load and parse a markdown file"""
        parsed = self.parser.parse_file(file_path)
        self.loaded_files[file_path] = parsed
        return parsed
    
    def load_content(self, content: str, name: str = "inline") -> Dict[str, Any]:
        """Parse markdown content directly"""
        parsed = self.parser.parse_content(content)
        self.loaded_files[name] = parsed
        return parsed
    
    def get_all_prompts(self) -> List[Dict[str, Any]]:
        """Get all prompts from loaded files"""
        all_prompts = []
        for file_path, data in self.loaded_files.items():
            for prompt in data.get('prompts', []):
                all_prompts.append({
                    'source': file_path,
                    **prompt
                })
        return all_prompts
    
    def get_all_libraries(self) -> List[str]:
        """Get all library imports"""
        libraries = set()
        for data in self.loaded_files.values():
            libraries.update(data.get('libraries', []))
        return list(libraries)
    
    def get_all_resources(self) -> List[str]:
        """Get all resources"""
        resources = set()
        for data in self.loaded_files.values():
            resources.update(data.get('resources', []))
        return list(resources)
    
    def get_all_keywords(self) -> List[Dict[str, str]]:
        """Get all keywords"""
        all_keywords = []
        for data in self.loaded_files.values():
            all_keywords.extend(data.get('keywords', []))
        return all_keywords
    
    def clear(self):
        """Clear all loaded files"""
        self.loaded_files.clear()


# Global instance
markdown_service = MarkdownService()
