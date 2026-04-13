# Krishi Rakshak API
FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system deps for pytesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-hin \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY class_names.json /app/
COPY best_model.keras /app/

RUN mkdir -p /app/forum_uploads

WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
