// An id taken from the address bar.
//
// Next.js hands a dynamic segment to the page still percent-encoded ("a%3Ab" for "a:b").
// The API client encodes an id again when it puts it in a path, so without this step an id
// with a character such as ":" (which the API allows) would be encoded twice and the API
// would be asked for a different id than the one in the link.
//
// An id cannot contain "%" (the API's identifier rule), so decoding once is exact. A
// malformed escape is left as it is: the API then answers "not found" for it.
export function decodeRouteId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
