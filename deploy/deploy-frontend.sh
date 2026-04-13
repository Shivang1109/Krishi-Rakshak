#!/bin/bash
# Krishi Rakshak — S3 Frontend Deploy Script
# Run this on your LOCAL machine after AWS CLI is configured
# Usage: bash deploy/deploy-frontend.sh <S3_BUCKET_NAME> <BACKEND_URL>
# Example: bash deploy/deploy-frontend.sh krishi-rakshak-frontend http://1.2.3.4:8000

set -e

BUCKET=${1:-"krishi-rakshak-frontend"}
BACKEND_URL=${2:-"http://127.0.0.1:8000"}

echo "=== Krishi Rakshak Frontend Deploy ==="
echo "Bucket: $BUCKET"
echo "Backend URL: $BACKEND_URL"

# 1. Update all meta krishi-api-base tags to point to real backend
echo "Patching API base URL in HTML files..."
for f in frontend/*.html; do
  sed -i.bak "s|content=\"http://127.0.0.1:8000\"|content=\"$BACKEND_URL\"|g" "$f"
  rm -f "${f}.bak"
done

# 2. Create S3 bucket (skip if exists)
echo "Creating S3 bucket..."
aws s3 mb s3://$BUCKET --region ap-south-1 2>/dev/null || echo "Bucket already exists"

# 3. Enable static website hosting
aws s3 website s3://$BUCKET \
  --index-document index.html \
  --error-document index.html

# 4. Set bucket policy for public read
aws s3api put-bucket-policy --bucket $BUCKET --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"PublicRead\",
    \"Effect\": \"Allow\",
    \"Principal\": \"*\",
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::$BUCKET/*\"
  }]
}"

# 5. Disable block public access
aws s3api put-public-access-block \
  --bucket $BUCKET \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# 6. Upload frontend files
echo "Uploading frontend files..."
aws s3 sync frontend/ s3://$BUCKET/ \
  --delete \
  --cache-control "max-age=86400" \
  --exclude "*.DS_Store"

# 7. Set HTML files to no-cache
aws s3 cp frontend/index.html s3://$BUCKET/index.html \
  --content-type "text/html" \
  --cache-control "no-cache, no-store, must-revalidate"

aws s3 cp frontend/home.html s3://$BUCKET/home.html \
  --content-type "text/html" \
  --cache-control "no-cache, no-store, must-revalidate"

aws s3 cp frontend/login.html s3://$BUCKET/login.html \
  --content-type "text/html" \
  --cache-control "no-cache, no-store, must-revalidate"

echo ""
echo "✅ Frontend live at: http://$BUCKET.s3-website.ap-south-1.amazonaws.com"
echo ""
echo "Next: Set up CloudFront for HTTPS (optional but recommended)"
