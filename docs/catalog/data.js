// This file is auto-generated from fixtures/feeds/sample-feed.json
// For development/preview only. NOT a signed production feed.
var FEED_DATA = {
  "feed_version": "0.1.0",
  "as_of": "2026-07-12T00:00:00Z",
  "providers": [
    {
      "id": "provider-a",
      "displayName": "Provider A (Safe)",
      "relationships": {
        "sponsored": false,
        "affiliate": false,
        "editorial_rank_influence": "none"
      },
      "trust": {
        "allowsPrivateCode": {
          "value": true,
          "evidence": {
            "sourceUrl": "https://provider-a.example/privacy",
            "retrievedAt": "2026-07-12T00:00:00Z",
            "sourceType": "manual",
            "confidence": "confirmed"
          }
        }
      }
    },
    {
      "id": "provider-b",
      "displayName": "Provider B (Aggregator)",
      "relationships": {
        "sponsored": false,
        "affiliate": false,
        "editorial_rank_influence": "none"
      },
      "trust": {
        "allowsPrivateCode": {
          "value": false,
          "evidence": {
            "sourceUrl": "https://provider-b.example/terms",
            "retrievedAt": "2026-07-12T00:00:00Z",
            "sourceType": "manual",
            "confidence": "confirmed"
          }
        }
      }
    }
  ],
  "offerings": [
    {
      "id": "provider-a:model-x:fixed",
      "modelId": "provider-a/model-x",
      "providerId": "provider-a",
      "endpointId": "provider-a:api",
      "upstreamModelId": "model-x",
      "marketingName": "Model X Standard",
      "declaredCapabilities": {
        "streaming": true,
        "tools": true
      },
      "status": "active",
      "pricing": {
        "currency": {
          "raw": "USD",
          "normalized": "USD"
        },
        "asOf": "2026-07-12",
        "inputPerMillion": {
          "raw": "$0.10 / 1M",
          "normalized": 0.1
        },
        "outputPerMillion": {
          "raw": "$0.30 / 1M",
          "normalized": 0.3
        }
      }
    },
    {
      "id": "provider-b:model-x:free",
      "modelId": "provider-b/model-x-free",
      "providerId": "provider-b",
      "endpointId": "provider-b:api",
      "upstreamModelId": "model-x-free",
      "marketingName": "Model X Free Promotion",
      "declaredCapabilities": {
        "streaming": true,
        "tools": false
      },
      "status": "active",
      "pricing": {
        "currency": {
          "raw": "USD",
          "normalized": "USD"
        },
        "asOf": "2026-07-12",
        "inputPerMillion": {
          "raw": "$0.00",
          "normalized": 0.0
        },
        "outputPerMillion": {
          "raw": "$0.00",
          "normalized": 0.0
        }
      }
    }
  ]
};
