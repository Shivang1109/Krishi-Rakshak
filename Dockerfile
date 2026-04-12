# Krishi Rakshak API — expects repo root with best_model.keras & class_names.json
FROM python:3.11-slim-bookworm

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY class_names.json /app/
COPY best_model.keras /app/

WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
