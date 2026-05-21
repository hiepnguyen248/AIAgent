"""
Database Service - MongoDB connection and usage logging.
Provides collections for: usage_logs, documents metadata, prompts.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure


class DBService:
    """MongoDB database service — singleton"""
    
    def __init__(self, mongo_uri: str, db_name: str):
        self._uri = mongo_uri
        self._db_name = db_name
        self._client: Optional[MongoClient] = None
        self._db = None
        self._initialized = False
    
    def initialize(self):
        """Connect to MongoDB and set up collections"""
        if self._initialized:
            return
        
        try:
            self._client = MongoClient(self._uri, serverSelectionTimeoutMS=5000)
            # Test connection
            self._client.admin.command('ping')
            self._db = self._client[self._db_name]
            
            # Ensure indexes
            self._db.usage_logs.create_index([("timestamp", -1)])
            self._db.usage_logs.create_index([("user_id", 1)])
            self._db.usage_logs.create_index([("action", 1)])
            self._db.documents.create_index([("source_name", 1)])
            self._db.documents.create_index([("project", 1)])
            self._db.documents.create_index([("status", 1)])
            self._db.prompts.create_index([("category", 1)])
            
            # Chat history — 30-day TTL auto-delete
            self._db.chat_history.create_index([("session_id", 1)])
            self._db.chat_history.create_index([("user_id", 1)])
            self._db.chat_history.create_index(
                [("created_at", 1)],
                expireAfterSeconds=30 * 24 * 3600  # 30 days
            )
            
            self._initialized = True
            print(f"[DB] MongoDB connected: {self._db_name}")
        except ConnectionFailure as e:
            print(f"[DB] MongoDB connection failed: {e}")
            self._initialized = False
    
    @property
    def is_connected(self) -> bool:
        return self._initialized and self._client is not None
    
    # ========================
    # Chat History (30-day TTL)
    # ========================
    
    def save_message(self, session_id: str, role: str, content: str, user_id: str = "anonymous"):
        """Save a chat message to MongoDB"""
        if not self.is_connected:
            return
        try:
            self._db.chat_history.insert_one({
                "session_id": session_id,
                "user_id": user_id,
                "role": role,
                "content": content,
                "created_at": datetime.now(timezone.utc),
            })
        except Exception as e:
            print(f"[DB] Save message error: {e}")
    
    def get_session_messages(self, session_id: str) -> List[Dict[str, str]]:
        """Get all messages for a session"""
        if not self.is_connected:
            return []
        try:
            msgs = list(self._db.chat_history.find(
                {"session_id": session_id},
                {"_id": 0, "role": 1, "content": 1}
            ).sort("created_at", 1))
            return msgs
        except Exception as e:
            print(f"[DB] Get messages error: {e}")
            return []
    
    def list_sessions(self, user_id: str = "anonymous", limit: int = 50) -> List[Dict[str, Any]]:
        """List recent sessions for a user"""
        if not self.is_connected:
            return []
        try:
            pipeline = [
                {"$match": {"user_id": user_id}},
                {"$group": {
                    "_id": "$session_id",
                    "message_count": {"$sum": 1},
                    "first_message": {"$first": "$content"},
                    "created_at": {"$min": "$created_at"},
                    "updated_at": {"$max": "$created_at"},
                }},
                {"$sort": {"updated_at": -1}},
                {"$limit": limit},
            ]
            results = list(self._db.chat_history.aggregate(pipeline))
            return [
                {
                    "session_id": r["_id"],
                    "message_count": r["message_count"],
                    "preview": (r.get("first_message") or "")[:80],
                    "created_at": r["created_at"].isoformat() if r.get("created_at") else "",
                    "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else "",
                }
                for r in results
            ]
        except Exception as e:
            print(f"[DB] List sessions error: {e}")
            return []
    
    def delete_session(self, session_id: str):
        """Delete all messages in a session"""
        if not self.is_connected:
            return
        try:
            self._db.chat_history.delete_many({"session_id": session_id})
        except Exception as e:
            print(f"[DB] Delete session error: {e}")
    
    # ========================
    # Usage Logging
    # ========================
    
    def log_usage(
        self,
        action: str,
        model: str = "",
        input_tokens: int = 0,
        output_tokens: int = 0,
        cost: float = 0.0,
        user_id: str = "anonymous",
        mode: str = "chat",
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Log a usage event to MongoDB"""
        if not self.is_connected:
            return
        
        try:
            doc = {
                "user_id": user_id,
                "action": action,
                "model": model,
                "mode": mode,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "cost": cost,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata or {},
            }
            self._db.usage_logs.insert_one(doc)
        except Exception as e:
            print(f"[DB] Usage log error: {e}")
    
    async def log_usage_async(self, **kwargs):
        """Async wrapper for log_usage"""
        await asyncio.to_thread(self.log_usage, **kwargs)
    
    def get_usage_summary(self, period_days: int = 7) -> Dict[str, Any]:
        """Get usage summary for dashboard"""
        if not self.is_connected:
            return {"error": "Database not connected"}
        
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
            
            pipeline = [
                {"$match": {"timestamp": {"$gte": cutoff}}},
                {"$group": {
                    "_id": None,
                    "total_requests": {"$sum": 1},
                    "total_input_tokens": {"$sum": "$input_tokens"},
                    "total_output_tokens": {"$sum": "$output_tokens"},
                    "total_tokens": {"$sum": "$total_tokens"},
                    "total_cost": {"$sum": "$cost"},
                    "unique_users": {"$addToSet": "$user_id"},
                    "models_used": {"$addToSet": "$model"},
                }}
            ]
            
            result = list(self._db.usage_logs.aggregate(pipeline))
            
            if result:
                r = result[0]
                return {
                    "total_requests": r.get("total_requests", 0),
                    "total_users": len(r.get("unique_users", [])),
                    "total_input_tokens": r.get("total_input_tokens", 0),
                    "total_output_tokens": r.get("total_output_tokens", 0),
                    "total_tokens": r.get("total_tokens", 0),
                    "total_cost": round(r.get("total_cost", 0), 4),
                    "models_used": r.get("models_used", []),
                    "errors": 0,
                    "period_days": period_days,
                }
            
            return {
                "total_requests": 0,
                "total_users": 0,
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_tokens": 0,
                "total_cost": 0,
                "models_used": [],
                "errors": 0,
                "period_days": period_days,
            }
        except Exception as e:
            return {"error": str(e)}
    
    def get_usage_by_user(self, period_days: int = 7) -> List[Dict[str, Any]]:
        """Get usage breakdown by user"""
        if not self.is_connected:
            return []
        
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
            
            pipeline = [
                {"$match": {"timestamp": {"$gte": cutoff}}},
                {"$group": {
                    "_id": "$user_id",
                    "requests": {"$sum": 1},
                    "input_tokens": {"$sum": "$input_tokens"},
                    "output_tokens": {"$sum": "$output_tokens"},
                    "total_tokens": {"$sum": "$total_tokens"},
                    "cost": {"$sum": "$cost"},
                    "last_activity": {"$max": "$timestamp"},
                    "actions": {"$addToSet": "$action"},
                }},
                {"$sort": {"requests": -1}}
            ]
            
            results = list(self._db.usage_logs.aggregate(pipeline))
            return [
                {
                    "user_id": r["_id"],
                    "requests": r["requests"],
                    "input_tokens": r["input_tokens"],
                    "output_tokens": r["output_tokens"],
                    "total_tokens": r["total_tokens"],
                    "cost": round(r["cost"], 4),
                    "last_activity": r["last_activity"],
                    "actions": r["actions"],
                }
                for r in results
            ]
        except Exception as e:
            print(f"[DB] Usage by user error: {e}")
            return []
    
    def get_usage_by_action(self, period_days: int = 7) -> List[Dict[str, Any]]:
        """Get usage breakdown by action type"""
        if not self.is_connected:
            return []
        
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
            
            pipeline = [
                {"$match": {"timestamp": {"$gte": cutoff}}},
                {"$group": {
                    "_id": "$action",
                    "count": {"$sum": 1},
                    "total_tokens": {"$sum": "$total_tokens"},
                    "total_cost": {"$sum": "$cost"},
                }},
                {"$sort": {"count": -1}}
            ]
            
            results = list(self._db.usage_logs.aggregate(pipeline))
            return [
                {
                    "action": r["_id"],
                    "count": r["count"],
                    "total_tokens": r["total_tokens"],
                    "total_cost": round(r["total_cost"], 4),
                }
                for r in results
            ]
        except Exception as e:
            print(f"[DB] Usage by action error: {e}")
            return []
    
    # ========================
    # Token cost estimation
    # ========================
    
    @staticmethod
    def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost based on model — tracks all models"""
        # Cost per 1M tokens (approximate)
        COST_TABLE = {
            # EXACODE (LGE internal — charged by token)
            "Chat-EXACODE-A": {"input": 3.0, "output": 6.0},
            # Ollama local models — essentially free but track for visibility
            "gemma4:latest": {"input": 0.0, "output": 0.0},
            "llama3:8b": {"input": 0.0, "output": 0.0},
            "qwen3:8b": {"input": 0.0, "output": 0.0},
        }
        
        rates = COST_TABLE.get(model, {"input": 0.0, "output": 0.0})
        cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
        return round(cost, 6)
    
    # ========================
    # Prompts CRUD
    # ========================
    
    def create_prompt(self, prompt: Dict[str, Any]) -> str:
        """Create a new prompt template"""
        if not self.is_connected:
            return ""
        
        import uuid
        prompt_id = str(uuid.uuid4())[:8]
        doc = {
            "_id": prompt_id,
            "name": prompt.get("name", "Untitled"),
            "description": prompt.get("description", ""),
            "category": prompt.get("category", "custom"),
            "template": prompt.get("template", ""),
            "variables": prompt.get("variables", []),
            "is_default": prompt.get("is_default", False),
            "created_by": prompt.get("created_by", "anonymous"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "usage_count": 0,
        }
        self._db.prompts.insert_one(doc)
        return prompt_id
    
    def get_prompts(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """List prompts, optionally filtered by category"""
        if not self.is_connected:
            return []
        
        query = {}
        if category:
            query["category"] = category
        
        results = list(self._db.prompts.find(query).sort("usage_count", -1))
        for r in results:
            r["id"] = r.pop("_id")
        return results
    
    def get_prompt(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Get a single prompt by ID"""
        if not self.is_connected:
            return None
        
        result = self._db.prompts.find_one({"_id": prompt_id})
        if result:
            result["id"] = result.pop("_id")
        return result
    
    def update_prompt(self, prompt_id: str, updates: Dict[str, Any]) -> bool:
        """Update a prompt template"""
        if not self.is_connected:
            return False
        
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = self._db.prompts.update_one(
            {"_id": prompt_id},
            {"$set": updates}
        )
        return result.modified_count > 0
    
    def delete_prompt(self, prompt_id: str) -> bool:
        """Delete a prompt template"""
        if not self.is_connected:
            return False
        
        result = self._db.prompts.delete_one({"_id": prompt_id})
        return result.deleted_count > 0
    
    def increment_prompt_usage(self, prompt_id: str):
        """Increment usage counter for a prompt"""
        if not self.is_connected:
            return
        self._db.prompts.update_one(
            {"_id": prompt_id},
            {"$inc": {"usage_count": 1}}
        )
    
    # ========================
    # Cleanup
    # ========================
    
    def close(self):
        """Close MongoDB connection"""
        if self._client:
            self._client.close()
            self._initialized = False
            print("[DB] MongoDB connection closed")


# ========================
# Global Instance
# ========================
_db_service: Optional[DBService] = None


def get_db_service() -> Optional[DBService]:
    """Get database service instance"""
    return _db_service


def configure_db(mongo_uri: str, db_name: str) -> DBService:
    """Configure and initialize database service"""
    global _db_service
    _db_service = DBService(mongo_uri, db_name)
    _db_service.initialize()
    return _db_service
