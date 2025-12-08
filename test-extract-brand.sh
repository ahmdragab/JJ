#!/bin/bash

# Test script for extract-brand function
# Usage: ./test-extract-brand.sh <website-url> [brand-id]

SUPABASE_URL=$(grep VITE_SUPABASE_URL .env | cut -d'=' -f2)
SUPABASE_KEY=$(grep VITE_SUPABASE_ANON_KEY .env | cut -d'=' -f2)

URL=${1:-"https://stripe.com"}
BRAND_ID=${2:-"00000000-0000-0000-0000-000000000000"}

echo "Testing extract-brand function..."
echo "URL: $URL"
echo "Brand ID: $BRAND_ID"
echo ""

curl -X POST "${SUPABASE_URL}/functions/v1/extract-brand" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -d "{\"url\": \"${URL}\", \"brandId\": \"${BRAND_ID}\"}" \
  | jq '.' 2>/dev/null || curl -X POST "${SUPABASE_URL}/functions/v1/extract-brand" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -d "{\"url\": \"${URL}\", \"brandId\": \"${BRAND_ID}\"}"

echo ""
echo ""
echo "Test complete!"







