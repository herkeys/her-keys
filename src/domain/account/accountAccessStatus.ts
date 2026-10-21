/** React Native can reject fetch with a plain Error, while browsers use TypeError. */
export async function fetchAccountAccessStatus(fetcher: typeof fetch, url: string, key: string, token: string): Promise<boolean> {
  let response: Response;
  try {
    response = await fetcher(url + '/rest/v1/rpc/account_access_status', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + token },
      body: '{}', signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Classify only a failed transport. HTTP denials and malformed responses stay outside this catch.
    const failure = new Error('account_status_network_unavailable');
    failure.name = 'AccountAccessNetworkError';
    throw failure;
  }
  if (!response.ok) throw new Error('status_unavailable');
  const status: unknown = await response.json();
  if (typeof status !== 'string') throw new Error('status_invalid');
  return status === 'active';
}
