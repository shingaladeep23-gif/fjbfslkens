# API image: slim Python, the app code and the January data snapshot, served by uvicorn.
# Built from the repo root (see docker-compose.yml), because the app reads ../data at startup.
FROM python:3.12-slim

WORKDIR /app

# Install the libraries first, so this layer is reused when only the code changes.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app backend/app
COPY data data

# main.py finds the data at backend/app/../../data, which is /app/data here.
WORKDIR /app/backend
EXPOSE 8000
# Several worker processes, because the API's work is CPU-bound and one Python process
# handles one calculation at a time. Each worker loads the data (about 70 MB) and has its own cache.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
