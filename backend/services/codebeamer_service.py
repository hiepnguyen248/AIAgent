"""
CodeBeamer Service - Integration with CodeBeamer using username/password auth
"""
import base64
import time
import hashlib
import json
import requests
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


@dataclass
class CacheEntry:
    """Cache entry with TTL support"""
    data: Any
    timestamp: float
    ttl: int
    
    def is_expired(self) -> bool:
        return time.time() - self.timestamp > self.ttl


class CodeBeamerService:
    """
    CodeBeamer API wrapper with Basic Auth (username/password)
    Features: caching, rate limiting, efficient queries
    """
    
    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        max_calls_per_minute: int = 60,
        default_cache_ttl: int = 300,
        ssl_verify: bool = True
    ):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.cache: Dict[str, CacheEntry] = {}
        self.default_cache_ttl = default_cache_ttl
        self.ssl_verify = ssl_verify
        self.call_timestamps: List[float] = []
        self.max_calls = max_calls_per_minute
        self.stats = {
            'api_calls': 0,
            'cache_hits': 0,
            'cache_misses': 0
        }
    
    def _get_auth_header(self) -> str:
        """Generate Basic Auth header"""
        credentials = f"{self.username}:{self.password}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded}"
    
    def _generate_cache_key(self, endpoint: str, params: Dict) -> str:
        """Generate unique cache key"""
        key_str = f"{endpoint}:{json.dumps(params, sort_keys=True)}"
        return hashlib.md5(key_str.encode()).hexdigest()
    
    def _get_from_cache(self, cache_key: str) -> Optional[Any]:
        """Get from cache if valid"""
        if cache_key in self.cache:
            entry = self.cache[cache_key]
            if not entry.is_expired():
                self.stats['cache_hits'] += 1
                return entry.data
            del self.cache[cache_key]
        self.stats['cache_misses'] += 1
        return None
    
    def _set_cache(self, cache_key: str, data: Any, ttl: Optional[int] = None):
        """Store in cache"""
        self.cache[cache_key] = CacheEntry(
            data=data,
            timestamp=time.time(),
            ttl=ttl or self.default_cache_ttl
        )
    
    def _rate_limit_wait(self):
        """Wait if rate limit would be exceeded"""
        now = time.time()
        self.call_timestamps = [ts for ts in self.call_timestamps if now - ts < 60]
        
        if len(self.call_timestamps) >= self.max_calls:
            wait_time = 60 - (now - self.call_timestamps[0]) + 0.1
            if wait_time > 0:
                time.sleep(wait_time)
                self.call_timestamps = []
        
        self.call_timestamps.append(now)
    
    def _make_request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        body: Optional[Dict] = None,
        use_cache: bool = True,
        cache_ttl: Optional[int] = None
    ) -> Any:
        """Make API request with auth, caching, and rate limiting"""
        if not endpoint.startswith('/'):
            endpoint = f'/{endpoint}'
        
        cache_key = self._generate_cache_key(endpoint, params or {})
        
        # Check cache
        if method == 'GET' and use_cache:
            cached = self._get_from_cache(cache_key)
            if cached is not None:
                return cached
        
        # Rate limiting
        self._rate_limit_wait()
        
        # Make request
        url = f"{self.base_url}{endpoint}"
        headers = {
            'Authorization': self._get_auth_header(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        
        self.stats['api_calls'] += 1
        
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=body,
                timeout=30,
                verify=self.ssl_verify
            )
            
            if response.status_code in (200, 201):
                try:
                    data = response.json()
                except json.JSONDecodeError:
                    data = {} if response.content else None
                
                if method == 'GET' and use_cache:
                    self._set_cache(cache_key, data, cache_ttl)
                
                return data
            else:
                return {
                    "error": True,
                    "status_code": response.status_code,
                    "message": f"API request failed: {response.status_code}",
                    "details": response.text
                }
                
        except requests.exceptions.SSLError as e:
            return {"error": True, "message": "SSL verification failed", "details": str(e)}
        except requests.exceptions.RequestException as e:
            return {"error": True, "message": f"Network error: {str(e)}"}
    
    def list_projects(self, page: int = 1, page_size: int = 100) -> Dict[str, Any]:
        """List all projects"""
        result = self._make_request(
            method='GET',
            endpoint=f'/rest/projects/page/{page}',
            params={'pageSize': min(page_size, 500)},
            cache_ttl=600
        )
        
        if isinstance(result, dict) and result.get('error'):
            result = self._make_request(
                method='GET',
                endpoint='/v3/projects',
                params={'page': page, 'pageSize': min(page_size, 500)},
                cache_ttl=600
            )
        
        return result
    
    def get_tracker_items(self, tracker_id: int, max_items: int = 500) -> Dict[str, Any]:
        """Get all items in a tracker"""
        return self._make_request(
            method='GET',
            endpoint=f'/v3/trackers/{tracker_id}/items',
            params={'pageSize': max_items}
        )
    
    def get_item(self, item_id: int) -> Dict[str, Any]:
        """Get single item details"""
        return self._make_request(
            method='GET',
            endpoint=f'/v3/items/{item_id}'
        )
    
    def get_test_cases(self, tracker_id: int) -> List[Dict[str, Any]]:
        """Get test cases from a tracker"""
        result = self.get_tracker_items(tracker_id)
        if isinstance(result, dict) and not result.get('error'):
            return result.get('items', [])
        return []
    
    def query_items(
        self,
        project_ids: Optional[List[int]] = None,
        tracker_ids: Optional[List[int]] = None,
        statuses: Optional[List[str]] = None,
        max_results: int = 100
    ) -> Dict[str, Any]:
        """Query items using CbQL"""
        conditions = []
        
        if project_ids:
            conditions.append(f"project.id IN ({', '.join(map(str, project_ids))})")
        if tracker_ids:
            conditions.append(f"tracker.id IN ({', '.join(map(str, tracker_ids))})")
        if statuses:
            status_list = ', '.join(f"'{s}'" for s in statuses)
            conditions.append(f"status IN ({status_list})")
        
        cbql = " AND ".join(conditions) if conditions else "project.id > 0"
        
        return self._make_request(
            method='POST',
            endpoint='/v3/items/query',
            body={
                'queryString': cbql,
                'page': 1,
                'pageSize': max_results
            }
        )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get usage statistics"""
        total = self.stats['cache_hits'] + self.stats['cache_misses']
        hit_rate = self.stats['cache_hits'] / total if total > 0 else 0
        
        return {
            **self.stats,
            'cache_hit_rate': f"{hit_rate:.2%}",
            'cache_size': len(self.cache)
        }
    
    def clear_cache(self):
        """Clear all cache"""
        self.cache.clear()


# Global service instance
_codebeamer_service: Optional[CodeBeamerService] = None


def get_codebeamer_service() -> Optional[CodeBeamerService]:
    """Get CodeBeamer service instance"""
    return _codebeamer_service


def configure_codebeamer(url: str, username: str, password: str, ssl_verify: bool = True):
    """Configure CodeBeamer service"""
    global _codebeamer_service
    _codebeamer_service = CodeBeamerService(
        base_url=url,
        username=username,
        password=password,
        ssl_verify=ssl_verify
    )
    return _codebeamer_service
