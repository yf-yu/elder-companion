"""伴老友 V8.3：中央氣象署預報/警示、台水與台電官方開放資料。"""
import csv
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
OUT = DATA / 'life_information.json'
STATUS = DATA / 'life_source_status.json'
TZ = timezone(timedelta(hours=8))
NOW = datetime.now(TZ)
MAX_BYTES = 20 * 1024 * 1024
CITIES = ('基隆市','臺北市','新北市','桃園市','新竹市','新竹縣','苗栗縣','臺中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','臺南市','高雄市','屏東縣','宜蘭縣','花蓮縣','臺東縣','澎湖縣','金門縣','連江縣')
HOSTS = ('data.gov.tw','opendata.cwa.gov.tw','taipower.com.tw','water.gov.tw','gov.tw')
ALERT_IDS = ('W-C0033-006','W-C0033-007','W-C0033-008','W-C0033-009','W-C0033-010')

def allowed(url):
    try:
        p = urlparse(url)
        h = (p.hostname or '').lower().rstrip('.')
        return p.scheme == 'https' and not p.username and not p.password and p.port in (None,443) and any(h == x or h.endswith('.'+x) for x in HOSTS)
    except ValueError:
        return False

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        from urllib.parse import urljoin
        target = urljoin(req.full_url, newurl)
        if not allowed(target):
            raise ValueError('不安全的轉址')
        return super().redirect_request(req, fp, code, msg, headers, target)

def fetch(url):
    if not allowed(url):
        raise ValueError('非官方 HTTPS 網址')
    req = Request(url, headers={'User-Agent':'BanLaoYou/8.3','Accept':'application/json,text/csv,application/zip,*/*'})
    with build_opener(SafeRedirect()).open(req, timeout=35) as response:
        if not allowed(response.geturl()):
            raise ValueError('最終網址不安全')
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('檔案超過 20MB')
        return data

def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()

def parse_dt(value):
    s = clean(value)
    if not s:
        return None
    s = s.replace('T',' ').replace('Z','+00:00')
    try:
        d = datetime.fromisoformat(s)
        return d.replace(tzinfo=TZ) if d.tzinfo is None else d.astimezone(TZ)
    except ValueError:
        pass
    m = re.match(r'^(\d{2,3})[/.-](\d{1,2})[/.-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?', s)
    if m:
        y = int(m[1]); y += 1911 if y < 1911 else 0
        try:
            return datetime(y,int(m[2]),int(m[3]),int(m[4] or 0),int(m[5] or 0),tzinfo=TZ)
        except ValueError:
            pass
    return None

def stamp(d):
    return d.isoformat() if d else None

def pick(row, *keys):
    for key in keys:
        if clean(row.get(key)):
            return clean(row[key])
    return ''

def unwrap(obj):
    if isinstance(obj,list):
        return [x for x in obj if isinstance(x,dict)]
    if isinstance(obj,dict):
        for key in ('records','data','result','items'):
            value = obj.get(key)
            if isinstance(value,list):
                return unwrap(value)
            if isinstance(value,dict):
                for child in value.values():
                    if isinstance(child,list):
                        return unwrap(child)
    raise ValueError('無法辨識資料列結構')

def rows_from_bytes(data):
    if data[:2] == b'PK':
        rows = []
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for info in z.infolist():
                if info.is_dir() or info.file_size > MAX_BYTES:
                    continue
                if info.filename.lower().endswith(('.csv','.json')):
                    rows.extend(rows_from_bytes(z.read(info)))
        if not rows:
            raise ValueError('ZIP 內沒有可讀的 CSV/JSON')
        return rows
    for enc in ('utf-8-sig','cp950','big5'):
        try:
            s = data.decode(enc)
            try:
                return unwrap(json.loads(s))
            except (ValueError,TypeError):
                reader = csv.DictReader(io.StringIO(s))
                rows = list(reader)
                if reader.fieldnames:
                    return rows
        except UnicodeError:
            continue
    raise ValueError('無法解析 JSON/CSV')

def dataset_urls(dataset_id):
    obj = json.loads(fetch(f'https://data.gov.tw/api/v2/rest/dataset/{dataset_id}'))
    if isinstance(obj,list):
        obj = obj[0]
    if isinstance(obj,dict) and isinstance(obj.get('result'),dict):
        obj = obj['result']
    if not isinstance(obj,dict):
        raise ValueError('詮釋資料格式錯誤')
    resources = obj.get('distribution') or obj.get('resources') or []
    if isinstance(resources,dict):
        resources = [resources]
    urls = []
    for r in resources:
        if isinstance(r,dict):
            for key in ('resourceDownloadUrl','resourceDownloadURL','downloadURL','url'):
                u = r.get(key)
                if isinstance(u,str) and allowed(u) and u not in urls:
                    urls.append(u)
    if not urls:
        raise ValueError('找不到官方資源下載網址')
    return urls

def city_in(value):
    value = value.replace('台','臺')
    return [c for c in CITIES if c in value]

def load_water():
    errors = []
    for url in dataset_urls(6050):
        try:
            rows = rows_from_bytes(fetch(url))
            output = []
            for r in rows:
                start = parse_dt(pick(r,'案件日期時間','停水開始時間','停水時間'))
                end = parse_dt(pick(r,'恢復日期時間','停水結束時間','復水時間'))
                if not start or not end or end < NOW or end < start:
                    continue
                area = pick(r,'停水地區','影響範圍')
                county = pick(r,'影響縣市','縣市')
                district = pick(r,'影響行政區','行政區')
                places = city_in(county+' '+area)
                if not (county or district or area):
                    continue
                output.append({'id':'water-'+clean(pick(r,'案件編號') or f'{start.isoformat()}-{county}-{area}')[:130], 'category':'預定停水','title':f'停水通知｜{county}{district}'[:120], 'summary':f'影響地區：{area}；原因：{pick(r,"停水原因","原因")}'[:300], 'cities':places,'district':district,'starts_at':stamp(start),'ends_at':stamp(end),'source':'台灣自來水公司','url':'https://data.gov.tw/dataset/6050'})
            return output
        except Exception as e:
            errors.append(str(e))
    raise RuntimeError('; '.join(errors)[:300])

def power_times(raw):
    # 台電原始欄位常將起迄放在同一字串；不能確定結束時間就不刊登。
    s = clean(raw)
    full = re.findall(r'\d{2,4}[/.-]\d{1,2}[/.-]\d{1,2}\s+\d{1,2}:\d{2}',s)
    if len(full)>=2:
        return parse_dt(full[0]),parse_dt(full[1])
    return None,None

def load_power():
    errors=[]
    for url in dataset_urls(26144):
        try:
            rows=rows_from_bytes(fetch(url))
            output=[]
            for r in rows:
                raw=pick(r,'第一次停電時間')
                start,end=power_times(raw)
                if not start or not end or end < NOW or end < start:
                    continue
                area=pick(r,'停電範圍')
                if not area:
                    continue
                office=pick(r,'營業區處')
                output.append({'id':'power-'+clean(pick(r,'請求號數') or f'{start.isoformat()}-{area}')[:130], 'category':'預定停電','title':f'預定停電｜{office or area[:20]}','summary':f'停電範圍：{area}；工作內容：{pick(r,"工作概述")}；查詢電話：1911'[:300],'cities':city_in(office+' '+area),'district':'','starts_at':stamp(start),'ends_at':stamp(end),'source':'台灣電力公司','url':'https://data.gov.tw/dataset/26144'})
            return output
        except Exception as e:
            errors.append(str(e))
    raise RuntimeError('; '.join(errors)[:300])

def cwa(api_id,key):
    url=f'https://opendata.cwa.gov.tw/api/v1/rest/datastore/{api_id}?'+urlencode({'Authorization':key,'format':'JSON'})
    obj=json.loads(fetch(url))
    if str(obj.get('success','')).lower() not in ('true','1'):
        raise ValueError(f'{api_id} API 未成功：'+clean(obj.get('message'))[:100])
    return obj

def weather_value(elements,code,index):
    for e in elements:
        if e.get('elementName')==code:
            periods=e.get('time',[])
            if index<len(periods):
                return clean(periods[index].get('parameter',{}).get('parameterName'))
    return ''

def load_forecast(key):
    obj=cwa('F-C0032-001',key)
    locations=obj.get('records',{}).get('location',[])
    output=[]
    for loc in locations:
        city=clean(loc.get('locationName')).replace('台','臺')
        if city not in CITIES:
            continue
        elements=loc.get('weatherElement',[])
        wx=next((e.get('time',[]) for e in elements if e.get('elementName')=='Wx'),[])
        for index,p in enumerate(wx):
            start=parse_dt(p.get('startTime'))
            end=parse_dt(p.get('endTime'))
            if not start or not end or end < NOW:
                continue
            condition=weather_value(elements,'Wx',index)
            low=weather_value(elements,'MinT',index)
            high=weather_value(elements,'MaxT',index)
            rain=weather_value(elements,'PoP',index)
            output.append({'id':f'weather-{city}-{start.isoformat()}','category':'天氣預報','title':f'{city}天氣｜{condition}','summary':f'氣溫 {low}～{high}°C，降雨機率 {rain}%。','cities':[city],'district':'','starts_at':stamp(start),'ends_at':stamp(end),'source':'中央氣象署','url':'https://www.cwa.gov.tw/'})
    if not output:
        raise ValueError('沒有有效的預報時段')
    return output

def nested_strings(obj):
    if isinstance(obj,str):
        yield obj
    elif isinstance(obj,list):
        for x in obj:
            yield from nested_strings(x)
    elif isinstance(obj,dict):
        for k,v in obj.items():
            if k not in ('Authorization','apikey'):
                yield from nested_strings(v)

def load_alert(api_id,key):
    obj=cwa(api_id,key)
    records=obj.get('records',{})
    # W 系列可能採不同巢狀結構；只有能確認標題與有效時間才刊登。
    candidates=[]
    def walk(node):
        if isinstance(node,dict):
            if any(k in node for k in ('headline','event','alertName','title')):
                candidates.append(node)
            for v in node.values():
                walk(v)
        elif isinstance(node,list):
            for v in node:
                walk(v)
    walk(records)
    output=[]
    for i,r in enumerate(candidates):
        title=pick(r,'headline','alertName','title','event')
        start=parse_dt(pick(r,'effective','onset','startTime','issueTime'))
        end=parse_dt(pick(r,'expires','endTime','expireTime'))
        if not title or not end or end < NOW:
            continue
        summary=pick(r,'description','instruction','content','summary')
        if not summary:
            summary='請查看中央氣象署原始警示內容及適用地區。'
        combined=' '.join(nested_strings(r))
        cities=city_in(combined)
        output.append({'id':f'{api_id}-{i}-{end.isoformat()}','category':'天氣警示','title':title[:120],'summary':summary[:300],'cities':cities,'district':'','starts_at':stamp(start),'ends_at':stamp(end),'source':'中央氣象署','url':'https://www.cwa.gov.tw/','api_id':api_id})
    return output

def main():
    DATA.mkdir(parents=True,exist_ok=True)
    previous={}
    if OUT.exists():
        try:
            previous=json.loads(OUT.read_text(encoding='utf-8'))
        except (ValueError,OSError):
            previous={}
    old=previous.get('items',[])
    if not isinstance(old,list):
        old=[]
    status={}
    collected=[]
    sources=[('預定停水',load_water),('預定停電',load_power)]
    key=os.environ.get('CWA_API_KEY','').strip()
    if key:
        sources.append(('天氣預報',lambda:load_forecast(key)))
        for code in ALERT_IDS:
            sources.append((code,lambda c=code:load_alert(c,key)))
    else:
        for name in ('天氣預報',)+ALERT_IDS:
            status[name]={'state':'not_configured','items':0,'message':'缺少 CWA_API_KEY'}
    for name,func in sources:
        try:
            items=func()
            status[name]={'state':'ok','items':len(items)}
            collected.extend(items)
        except Exception as exc:
            status[name]={'state':'error','items':0,'message':str(exc)[:250]}
    # 失敗來源不以空陣列覆蓋舊資料，但舊資料仍必須有有效截止時間。
    keep=[]
    for item in old:
        if not isinstance(item,dict):
            continue
        end=parse_dt(item.get('ends_at'))
        if not end or end < NOW:
            continue
        group=item.get('api_id') if item.get('category')=='天氣警示' else item.get('category')
        if status.get(group,{}).get('state')!='ok':
            keep.append(item)
    unique={}
    for item in keep+collected:
        unique[item['id']]=item
    result={'generated_at':datetime.now(timezone.utc).isoformat(),'items':list(unique.values())}
    report={'checked_at':result['generated_at'],'sources':status,'items':len(result['items'])}
    def write_atomic(path,obj):
        tmp=path.with_suffix('.json.tmp')
        tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        tmp.replace(path)
    write_atomic(OUT,result)
    write_atomic(STATUS,report)
    print(json.dumps(report,ensure_ascii=False,indent=2))
    # 所有來源錯誤時仍保留有效的舊事件；不虛構成功。

if __name__=='__main__':
    try:
        main()
    except Exception as exc:
        print('民生整合錯誤：'+str(exc),file=sys.stderr)
        sys.exit(1)
