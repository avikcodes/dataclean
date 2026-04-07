import os
import io
import json
import uuid
import base64
import hashlib
import traceback

import numpy as np
import pandas as pd
import requests

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware allowing all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPSTASH_REDIS_REST_URL = os.getenv("UPSTASH_REDIS_REST_URL")
UPSTASH_REDIS_REST_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# PART 1 - Redis cache functions
def get_cache(file_hash):
    try:
        url = f"{UPSTASH_REDIS_REST_URL}/get/{file_hash}"
        headers = {"Authorization": f"Bearer {UPSTASH_REDIS_REST_TOKEN}"}
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            result = response.json()
            if result.get("result"):
                return json.loads(result["result"])
        return None
    except Exception:
        return None

def set_cache(file_hash, data):
    try:
        url = f"{UPSTASH_REDIS_REST_URL}/set/{file_hash}"
        headers = {"Authorization": f"Bearer {UPSTASH_REDIS_REST_TOKEN}"}
        body = {"value": json.dumps(data), "ex": 86400}
        requests.post(url, headers=headers, json=body)
    except Exception:
        pass


# PART 2 - Supabase save function
def save_to_supabase(session_id, file_name, original_rows, cleaned_rows, changes_made, ai_report):
    try:
        url = f"{SUPABASE_URL}/rest/v1/cleaning_sessions"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        body = {
            "session_id": str(session_id),
            "file_name": file_name,
            "original_rows": original_rows,
            "cleaned_rows": cleaned_rows,
            "changes_made": json.dumps(changes_made),
            "ai_report": ai_report
        }
        response = requests.post(url, headers=headers, json=body)
        print(f"Supabase save status code: {response.status_code}")
        if response.status_code != 201:
            print(response.text)
    except Exception as e:
        print(f"Error saving to Supabase: {e}")


# PART 3 - History endpoint
@app.get("/history")
def history():
    try:
        url = f"{SUPABASE_URL}/rest/v1/cleaning_sessions?select=*&order=created_at.desc&limit=10"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()
        return []
    except Exception:
        return []


# PART 4 - clean_dataframe function
def clean_dataframe(df):
    changes_dict = {
        "duplicates_removed": 0,
        "missing_filled": {},
        "outliers_capped": {},
        "text_cleaned": []
    }
    
    # Step 1: Remove duplicate rows
    initial_rows = len(df)
    df = df.drop_duplicates()
    changes_dict["duplicates_removed"] = initial_rows - len(df)
    
    for column in df.columns:
        # Step 2 & 3: Fill missing values
        missing_count = int(df[column].isnull().sum())
        if missing_count > 0:
            if pd.api.types.is_numeric_dtype(df[column]):
                median_val = df[column].median()
                df[column] = df[column].fillna(median_val)
            else:
                mode_val = df[column].mode()[0] if not df[column].mode().empty else ""
                df[column] = df[column].fillna(mode_val)
            changes_dict["missing_filled"][column] = missing_count
            
        # Step 4: For each numeric column detect outliers using IQR, cap them
        if pd.api.types.is_numeric_dtype(df[column]):
            Q1 = df[column].quantile(0.25)
            Q3 = df[column].quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            
            outliers = (df[column] < lower_bound) | (df[column] > upper_bound)
            outliers_count = int(outliers.sum())
            if outliers_count > 0:
                df[column] = df[column].clip(lower=lower_bound, upper=upper_bound)
                changes_dict["outliers_capped"][column] = outliers_count
                
        # Step 5: For each string column strip whitespace and lowercase
        if pd.api.types.is_string_dtype(df[column]) or pd.api.types.is_object_dtype(df[column]):
            try:
                df[column] = df[column].astype(str).str.strip().str.lower()
                if column not in changes_dict["text_cleaned"]:
                    changes_dict["text_cleaned"].append(column)
            except Exception:
                pass

    return df, changes_dict


# PART 5 - generate_comparison function
def generate_comparison(original_df, cleaned_df, changes_dict):
    missing_before_dict = {str(k): int(v) for k, v in original_df.isnull().sum().to_dict().items()}
    missing_after_dict = {str(k): int(v) for k, v in cleaned_df.isnull().sum().to_dict().items()}
    
    columns_modified = list(set(
        list(changes_dict["missing_filled"].keys()) +
        list(changes_dict["outliers_capped"].keys()) +
        changes_dict["text_cleaned"]
    ))
    
    return {
        "rows_before": len(original_df),
        "rows_after": len(cleaned_df),
        "duplicates_removed": changes_dict["duplicates_removed"],
        "missing_before": missing_before_dict,
        "missing_after": missing_after_dict,
        "outliers_capped": changes_dict["outliers_capped"],
        "text_cleaned": changes_dict["text_cleaned"],
        "columns_modified": columns_modified
    }


# PART 6 - generate_report function
def generate_report(comparison, file_name):
    try:
        api_key = os.getenv("GROQ_API_KEY")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        body = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a data cleaning expert. Given cleaning results write a plain English report explaining what was fixed and why it matters for ML. Under 100 words."
                },
                {
                    "role": "user",
                    "content": f"File: {file_name} Duplicates removed: {comparison['duplicates_removed']} Missing values fixed: {comparison['missing_before']} Outliers capped: {comparison['outliers_capped']}"
                }
            ]
        }
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=body
        )
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Groq error: {str(e)}")
        return "Report unavailable"


# PART 7 - WebSocket endpoint /ws/clean
@app.websocket("/ws/clean")
async def websocket_clean(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connected")
    try:
        # Receive JSON with filename and data (base64)
        received = await websocket.receive_json()
        print("Data received")
        file_name = received.get("filename", "unknown.csv")
        data_base64 = received.get("data", "")
        
        # Decode base64 to bytes
        csv_bytes = base64.b64decode(data_base64)
        
        # Generate MD5 hash
        file_hash = hashlib.md5(csv_bytes).hexdigest()
        
        # Checking cache...
        await websocket.send_json({"step": "Checking cache...", "progress": 10})
        
        cached_result = get_cache(file_hash)
        if cached_result is not None:
            await websocket.send_json({"step": "Cache hit...", "progress": 90})
            cached_result["step"] = "Complete"
            cached_result["progress"] = 100
            await websocket.send_json(cached_result)
            return
            
        # Cache miss
        await websocket.send_json({"step": "Parsing CSV...", "progress": 20})
        df = pd.read_csv(io.BytesIO(csv_bytes))
        original_df = df.copy()
        
        await websocket.send_json({"step": "Removing duplicates...", "progress": 30})
        await websocket.send_json({"step": "Fixing missing values...", "progress": 45})
        await websocket.send_json({"step": "Capping outliers...", "progress": 60})
        await websocket.send_json({"step": "Cleaning text columns...", "progress": 70})
        
        cleaned_df, changes = clean_dataframe(df)
        
        await websocket.send_json({"step": "Generating report...", "progress": 80})
        comparison = generate_comparison(original_df, cleaned_df, changes)
        report = generate_report(comparison, file_name)
        
        # Convert cleaned_df to CSV bytes then to base64 string
        csv_buffer = io.StringIO()
        cleaned_df.to_csv(csv_buffer, index=False)
        csv_bytes_out = csv_buffer.getvalue().encode('utf-8')
        base64_csv_string = base64.b64encode(csv_bytes_out).decode('utf-8')
        
        await websocket.send_json({"step": "Saving to history...", "progress": 90})
        
        session_id = uuid.uuid4()
        
        result_payload = {
            "comparison": comparison,
            "cleaned_csv": base64_csv_string,
            "ai_report": report,
            "session_id": str(session_id)
        }
        
        # Save to Redis
        set_cache(file_hash, result_payload)
        
        # Save to Supabase
        save_to_supabase(
            session_id=session_id,
            file_name=file_name,
            original_rows=comparison["rows_before"],
            cleaned_rows=comparison["rows_after"],
            changes_made=changes,
            ai_report=report
        )
        
        # Send Complete
        result_payload["step"] = "Complete"
        result_payload["progress"] = 100
        await websocket.send_json(result_payload)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        traceback.print_exc()
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass


# PART 8 - Health check
@app.get("/health")
def health_check():
    return {"status": "ok"}
