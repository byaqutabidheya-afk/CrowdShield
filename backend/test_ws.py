import asyncio
import websockets
import json
import urllib.request

async def test():
    async with websockets.connect('ws://localhost:8000/ws/live') as ws1, websockets.connect('ws://localhost:8000/ws/live') as ws2:
        req = urllib.request.Request(
            'http://localhost:8000/api/announcements', 
            data=json.dumps({'message':'Test Broadcast', 'priority':'high', 'zone_id': 'zone_1'}).encode('utf-8'), 
            headers={'Content-Type':'application/json'}, 
            method='POST'
        )
        urllib.request.urlopen(req)
        
        msg1 = await asyncio.wait_for(ws1.recv(), timeout=5.0)
        msg2 = await asyncio.wait_for(ws2.recv(), timeout=5.0)
        print('Dashboard received:', msg1)
        print('PWA received:', msg2)

asyncio.run(test())
