export function retryDelivery(attempt) {
  return attempt < 3 ? "retry" : "failed";
}
