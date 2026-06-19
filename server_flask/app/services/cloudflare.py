import os
import json
import urllib.request
import urllib.error
import threading

def purge_cache_async():
    """
    Purges the Cloudflare cache asynchronously to avoid blocking the main thread.
    """
    zone_id = os.environ.get("CLOUDFLARE_ZONE_ID")
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN")

    if not zone_id or not api_token:
        # Configuration not provided, skip purging.
        return

    def _purge():
        url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache"
        data = json.dumps({"purge_everything": True}).encode('utf-8')
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Authorization", f"Bearer {api_token}")
        req.add_header("Content-Type", "application/json")
        
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    print("Successfully purged Cloudflare cache.")
                else:
                    print(f"Cloudflare cache purge returned status {response.status}")
        except urllib.error.URLError as e:
            print(f"Failed to purge Cloudflare cache: {e}")

    thread = threading.Thread(target=_purge)
    thread.daemon = True
    thread.start()
