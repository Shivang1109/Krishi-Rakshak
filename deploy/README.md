# Krishi Rakshak — AWS Deployment Guide

## Architecture
```
Users → CloudFront → S3 (frontend HTML/JS/CSS)
                  ↓
             EC2 t3.small (Docker → FastAPI backend)
```

---

## PART 1: Deploy Backend to EC2

### 1. Launch EC2 Instance
- Go to AWS Console → EC2 → Launch Instance
- AMI: **Ubuntu 22.04 LTS**
- Instance type: **t3.small** (2 vCPU, 2GB RAM — needed for TensorFlow)
- Storage: **20GB gp3**
- Security Group — open these ports:
  - SSH: 22 (your IP only)
  - HTTP: 80 (anywhere)
  - Custom TCP: **8000** (anywhere, for API)
- Create or select a key pair, download the `.pem` file

### 2. SSH into EC2
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### 3. Run the deploy script
```bash
curl -fsSL https://raw.githubusercontent.com/Shivang1109/Krishi-Rakshak/main/deploy/deploy-backend.sh | bash
```

Or manually:
```bash
git clone https://github.com/Shivang1109/Krishi-Rakshak.git
cd Krishi-Rakshak
nano .env   # Add your ANTHROPIC_API_KEY
docker compose up -d --build
```

### 4. Verify backend is running
```
http://YOUR_EC2_IP:8000/health
```
Should return: `{"status":"ok","model_loaded":true,"num_classes":54}`

---

## PART 2: Deploy Frontend to S3

### Prerequisites
- AWS CLI installed: `pip install awscli`
- Configured: `aws configure` (enter Access Key, Secret, region: ap-south-1)

### Run deploy script
```bash
bash deploy/deploy-frontend.sh krishi-rakshak-app http://YOUR_EC2_IP:8000
```

### Frontend URL
```
http://krishi-rakshak-app.s3-website.ap-south-1.amazonaws.com
```

---

## PART 3: CloudFront (HTTPS) — Optional

1. Go to CloudFront → Create Distribution
2. Origin: your S3 bucket website endpoint
3. Enable HTTPS redirect
4. Default root object: `index.html`
5. Error pages: 404 → `/index.html` (200)

---

## CORS Fix (Important!)

After deploying, update `backend/main.py` CORS origins to include your S3/CloudFront URL:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://krishi-rakshak-app.s3-website.ap-south-1.amazonaws.com",
        "https://YOUR_CLOUDFRONT_DOMAIN.cloudfront.net",
        "*"  # Remove this in production
    ],
    ...
)
```

Then rebuild: `docker compose up -d --build`

---

## Quick Reference

| Component | URL |
|---|---|
| Frontend (CloudFront) | `https://d3bsxgl8cuk253.cloudfront.net` |
| Backend (CloudFront) | `https://d2edjmigl4cl66.cloudfront.net` |
| Backend EC2 direct | `http://13.201.134.130:8000` |
| API Docs | `https://d2edjmigl4cl66.cloudfront.net/docs` |
| Health Check | `https://d2edjmigl4cl66.cloudfront.net/health` |

## Estimated Cost
| Service | Cost |
|---|---|
| EC2 t3.small | ~$15/month |
| S3 + CloudFront | ~$1/month |
| **Total** | **~$16/month** |
