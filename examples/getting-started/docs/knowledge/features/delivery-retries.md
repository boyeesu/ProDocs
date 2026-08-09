---
kind: feature
id: delivery-retries
title: Delivery retry behavior
status: active
audiences:
  - product
  - support
evidence:
  - src/delivery.js#retryDelivery
  - test/delivery.test.js
customerImpact: Failed deliveries retry automatically before requiring attention.
---
Delivery attempts stop after the reviewed retry limit.
