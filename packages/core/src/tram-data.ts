// 由 tools/tram-data.py 生成（data.gov.hk 電車站 + 運輸署 GTFS），唔好人手改
/** 行駛方向：W 西行、E 東行、S／N 跑馬地環綫南行／北行、T 總站 */
export type TramDir = 'W' | 'E' | 'S' | 'N' | 'T';
export interface TramStation {
  /** 站 ID：一般站 = 電車公司站代號（例如 02W、01E、105），總站 = 主要代號（例如 SKT、HVT） */
  id: string;
  zh: string;
  en: string;
  dir: TramDir;
  /** 電車公司「下一班電車」到站代號（總站可以有兩個，例如上環西行到站 WM、東行開出 WMT） */
  codes: string[];
  lat: number;
  lng: number;
  terminus?: true;
  /** 只落客（屈地街電車廠） */
  alightOnly?: true;
}
export interface TramRoute {
  /** 運輸署 GTFS route_id */
  id: string;
  zh: string;
  en: string;
  /** GTFS 方向（1／2）→ 站 ID（行車次序） */
  dirs: Record<string, string[]>;
}

/** 所有站：西行（筲箕灣 → 堅尼地城）、東行（堅尼地城 → 筲箕灣）、跑馬地環綫南行、北行，各自按行車次序 */
export const TRAM_STATIONS: TramStation[] = [
  {"id": "SKT", "zh": "筲箕灣", "en": "Shau Kei Wan", "dir": "T", "codes": ["SKT"], "lat": 22.2779, "lng": 114.23021, "terminus": true},
  {"id": "02W", "zh": "柴灣道", "en": "Chai Wan Road", "dir": "W", "codes": ["02W"], "lat": 22.27675, "lng": 114.2289},
  {"id": "04W", "zh": "新成街", "en": "Sun Sing Street", "dir": "W", "codes": ["04W"], "lat": 22.27955, "lng": 114.22578},
  {"id": "06W", "zh": "海富街", "en": "Hoi Foo Street", "dir": "W", "codes": ["06W"], "lat": 22.28039, "lng": 114.22437},
  {"id": "08W", "zh": "聖十字徑", "en": "Holy Cross Path", "dir": "W", "codes": ["08W"], "lat": 22.28117, "lng": 114.22267},
  {"id": "10W", "zh": "太康街", "en": "Tai Hong Street", "dir": "W", "codes": ["10W"], "lat": 22.28316, "lng": 114.22104},
  {"id": "12W", "zh": "太古城道", "en": "Tai Koo Shing Road", "dir": "W", "codes": ["12W"], "lat": 22.28409, "lng": 114.22031},
  {"id": "14W", "zh": "康山", "en": "Kornhill", "dir": "W", "codes": ["14W"], "lat": 22.2846, "lng": 114.216},
  {"id": "16W", "zh": "船塢里", "en": "Shipyard Lane", "dir": "W", "codes": ["16W"], "lat": 22.28463, "lng": 114.21378},
  {"id": "18W", "zh": "柏架山道", "en": "Mount Parker Road", "dir": "W", "codes": ["18W"], "lat": 22.28483, "lng": 114.21207},
  {"id": "20W", "zh": "芬尼街", "en": "Finnie Street", "dir": "W", "codes": ["20W"], "lat": 22.28858, "lng": 114.20981},
  {"id": "22W", "zh": "渣華道", "en": "Java Road", "dir": "W", "codes": ["22W"], "lat": 22.29074, "lng": 114.20908},
  {"id": "24W", "zh": "健康東街", "en": "Healthy Street East", "dir": "W", "codes": ["24W"], "lat": 22.29172, "lng": 114.20743},
  {"id": "26W", "zh": "健康西街", "en": "Healthy Street West", "dir": "W", "codes": ["26W"], "lat": 22.29206, "lng": 114.20508},
  {"id": "28W", "zh": "電照街", "en": "Tin Chiu Street", "dir": "W", "codes": ["28W"], "lat": 22.29184, "lng": 114.20366},
  {"id": "30W", "zh": "書局街", "en": "Shu Kuk Street", "dir": "W", "codes": ["30W"], "lat": 22.29124, "lng": 114.20066},
  {"id": "NPT", "zh": "北角", "en": "North Point", "dir": "T", "codes": ["NPT"], "lat": 22.29116, "lng": 114.19876, "terminus": true},
  {"id": "32W", "zh": "北角道", "en": "North Point Road", "dir": "W", "codes": ["32W"], "lat": 22.2905, "lng": 114.19707},
  {"id": "34W", "zh": "炮台山", "en": "Fortress Hill", "dir": "W", "codes": ["34W"], "lat": 22.28914, "lng": 114.19433},
  {"id": "36W", "zh": "木星街", "en": "Jupiter Street", "dir": "W", "codes": ["36W"], "lat": 22.28662, "lng": 114.19292},
  {"id": "38W", "zh": "琉璃街", "en": "Lau Li Street", "dir": "W", "codes": ["38W"], "lat": 22.28447, "lng": 114.19275},
  {"id": "40W", "zh": "留仙街", "en": "Lau Sin Street", "dir": "W", "codes": ["40W"], "lat": 22.28266, "lng": 114.19218},
  {"id": "42W", "zh": "維多利亞公園", "en": "Victoria Park", "dir": "W", "codes": ["42W"], "lat": 22.28066, "lng": 114.1896},
  {"id": "44W", "zh": "信德街", "en": "Shelter Street", "dir": "W", "codes": ["44W"], "lat": 22.27965, "lng": 114.18809},
  {"id": "CBT", "zh": "銅鑼灣", "en": "Causeway Bay", "dir": "T", "codes": ["CBT"], "lat": 22.27927, "lng": 114.18702, "terminus": true},
  {"id": "46W", "zh": "邊寧頓街", "en": "Pennington Street", "dir": "W", "codes": ["46W"], "lat": 22.2795, "lng": 114.18658},
  {"id": "48W", "zh": "百德新街", "en": "Paterson Street", "dir": "W", "codes": ["48W"], "lat": 22.27986, "lng": 114.18545},
  {"id": "50W", "zh": "堅拿道西", "en": "Canal Road West", "dir": "W", "codes": ["50W"], "lat": 22.27934, "lng": 114.18125},
  {"id": "52W", "zh": "杜老誌道", "en": "Tonnochy Road", "dir": "W", "codes": ["52W"], "lat": 22.27816, "lng": 114.17767},
  {"id": "54W", "zh": "巴路士街", "en": "Burrows Street", "dir": "W", "codes": ["54W"], "lat": 22.27725, "lng": 114.17591},
  {"id": "56W", "zh": "柯布連道", "en": "O'Brien Road", "dir": "W", "codes": ["56W"], "lat": 22.27654, "lng": 114.17341},
  {"id": "58W", "zh": "汕頭街", "en": "Swatow Street", "dir": "W", "codes": ["58W"], "lat": 22.27639, "lng": 114.17206},
  {"id": "60W", "zh": "機利臣街", "en": "Gresson Street", "dir": "W", "codes": ["60W"], "lat": 22.27711, "lng": 114.17015},
  {"id": "62W", "zh": "軍器廠街", "en": "Arsenal Street", "dir": "W", "codes": ["62W"], "lat": 22.27776, "lng": 114.16851},
  {"id": "64W", "zh": "金鐘港鐵站", "en": "Admiralty MTR Station", "dir": "W", "codes": ["64W"], "lat": 22.27827, "lng": 114.16454},
  {"id": "66W", "zh": "紅棉道", "en": "Cotton Tree Drive", "dir": "W", "codes": ["66W"], "lat": 22.27921, "lng": 114.16287},
  {"id": "68W", "zh": "銀行街", "en": "Bank Street", "dir": "W", "codes": ["68W"], "lat": 22.28062, "lng": 114.15965},
  {"id": "70W", "zh": "畢打街", "en": "Pedder Street", "dir": "W", "codes": ["70W"], "lat": 22.28175, "lng": 114.15796},
  {"id": "72W", "zh": "砵甸乍街", "en": "Pottinger Street", "dir": "W", "codes": ["72W"], "lat": 22.28349, "lng": 114.15657},
  {"id": "74W", "zh": "機利文街", "en": "Gilman Street", "dir": "W", "codes": ["74W"], "lat": 22.28524, "lng": 114.15494},
  {"id": "76W", "zh": "文華里", "en": "Man Wah Lane", "dir": "W", "codes": ["76W"], "lat": 22.28629, "lng": 114.15296},
  {"id": "WMT", "zh": "上環（西港城）", "en": "Western Market", "dir": "T", "codes": ["WM", "WMT"], "lat": 22.28686, "lng": 114.15068, "terminus": true},
  {"id": "78W", "zh": "港澳碼頭", "en": "Macau Ferry Terminal", "dir": "W", "codes": ["78W"], "lat": 22.28774, "lng": 114.14988},
  {"id": "80W", "zh": "干諾道西", "en": "Connaught Road West", "dir": "W", "codes": ["80W"], "lat": 22.28801, "lng": 114.14879},
  {"id": "82W", "zh": "修打蘭街", "en": "Sutherland Street", "dir": "W", "codes": ["82W"], "lat": 22.28771, "lng": 114.14608},
  {"id": "84W", "zh": "東邊街", "en": "Eastern Street", "dir": "W", "codes": ["84W"], "lat": 22.28784, "lng": 114.14408},
  {"id": "86W", "zh": "西邊街", "en": "Western Street", "dir": "W", "codes": ["86W"], "lat": 22.28793, "lng": 114.14109},
  {"id": "88W", "zh": "水街", "en": "Water Street", "dir": "W", "codes": ["88W"], "lat": 22.28748, "lng": 114.13902},
  {"id": "90W", "zh": "屈地街", "en": "Whitty Street", "dir": "W", "codes": ["90W"], "lat": 22.28686, "lng": 114.13677},
  {"id": "92W", "zh": "山道", "en": "Hill Road", "dir": "W", "codes": ["92W"], "lat": 22.28701, "lng": 114.13452},
  {"id": "94W", "zh": "屈地街電車廠", "en": "Whitty Street Depot", "dir": "W", "codes": ["94W"], "lat": 22.286565, "lng": 114.133315, "alightOnly": true},
  {"id": "96W", "zh": "皇后大道西", "en": "Queen's Road West", "dir": "W", "codes": ["96W"], "lat": 22.28612, "lng": 114.13211},
  {"id": "98W", "zh": "堅尼地城海傍", "en": "Kennedy Town Praya", "dir": "W", "codes": ["98W"], "lat": 22.2843, "lng": 114.13036},
  {"id": "100W", "zh": "山市街", "en": "Sands Street", "dir": "W", "codes": ["100W"], "lat": 22.28348, "lng": 114.12934},
  {"id": "102W", "zh": "士美菲路", "en": "Smithfield", "dir": "W", "codes": ["102W"], "lat": 22.28317, "lng": 114.1277},
  {"id": "104W", "zh": "爹核士街", "en": "Davis Street", "dir": "W", "codes": ["104W"], "lat": 22.28305, "lng": 114.12703},
  {"id": "KTT", "zh": "堅尼地城", "en": "Kennedy Town", "dir": "T", "codes": ["KTT"], "lat": 22.28299, "lng": 114.1263, "terminus": true},
  {"id": "01E", "zh": "北街", "en": "North Street", "dir": "E", "codes": ["01E"], "lat": 22.2834, "lng": 114.12878},
  {"id": "03E", "zh": "荷蘭街", "en": "Holland Street", "dir": "E", "codes": ["03E"], "lat": 22.28458, "lng": 114.13055},
  {"id": "05E", "zh": "皇后大道西", "en": "Queen's Road West", "dir": "E", "codes": ["05E"], "lat": 22.28658, "lng": 114.13225},
  {"id": "07E", "zh": "山道", "en": "Hill Road", "dir": "E", "codes": ["07E"], "lat": 22.28715, "lng": 114.13425},
  {"id": "WST", "zh": "石塘咀", "en": "Shek Tong Tsui", "dir": "T", "codes": ["WST"], "lat": 22.28709, "lng": 114.13508, "terminus": true},
  {"id": "09E", "zh": "屈地街", "en": "Whitty Street", "dir": "E", "codes": ["09E"], "lat": 22.28682, "lng": 114.13643},
  {"id": "11E", "zh": "水街", "en": "Water Street", "dir": "E", "codes": ["11E"], "lat": 22.28742, "lng": 114.13858},
  {"id": "13E", "zh": "西邊街", "en": "Western Street", "dir": "E", "codes": ["13E"], "lat": 22.28798, "lng": 114.14065},
  {"id": "15E", "zh": "東邊街", "en": "Eastern Street", "dir": "E", "codes": ["15E"], "lat": 22.2879, "lng": 114.14363},
  {"id": "17E", "zh": "皇后街", "en": "Queen Street", "dir": "E", "codes": ["17E"], "lat": 22.28769, "lng": 114.14708},
  {"id": "19E", "zh": "港澳碼頭", "en": "Macau Ferry Terminal", "dir": "E", "codes": ["19E"], "lat": 22.28776, "lng": 114.15011},
  {"id": "21E", "zh": "禧利街", "en": "Hillier Street", "dir": "E", "codes": ["21E"], "lat": 22.28662, "lng": 114.1519},
  {"id": "23E", "zh": "機利文街", "en": "Gilman Street", "dir": "E", "codes": ["23E"], "lat": 22.28547, "lng": 114.15466},
  {"id": "25E", "zh": "租庇利街", "en": "Jubilee Street", "dir": "E", "codes": ["25E"], "lat": 22.2847, "lng": 114.15566},
  {"id": "27E", "zh": "畢打街", "en": "Pedder Street", "dir": "E", "codes": ["27E"], "lat": 22.28221, "lng": 114.15763},
  {"id": "29E", "zh": "雪廠街", "en": "Ice House Street", "dir": "E", "codes": ["29E"], "lat": 22.28103, "lng": 114.15861},
  {"id": "31E", "zh": "銀行街", "en": "Bank Street", "dir": "E", "codes": ["31E"], "lat": 22.28053, "lng": 114.16025},
  {"id": "33E", "zh": "美利道", "en": "Murray Road", "dir": "E", "codes": ["33E"], "lat": 22.27972, "lng": 114.16199},
  {"id": "35E", "zh": "金鐘港鐵站", "en": "Admiralty MTR Station", "dir": "E", "codes": ["35E"], "lat": 22.2784, "lng": 114.16438},
  {"id": "37E", "zh": "軍器廠街", "en": "Arsenal Street", "dir": "E", "codes": ["37E"], "lat": 22.27785, "lng": 114.16817},
  {"id": "39E", "zh": "分域街", "en": "Fenwick Street", "dir": "E", "codes": ["39E"], "lat": 22.27725, "lng": 114.17008},
  {"id": "41E", "zh": "盧押道", "en": "Luard Road", "dir": "E", "codes": ["41E"], "lat": 22.27645, "lng": 114.172},
  {"id": "43E", "zh": "柯布連道", "en": "O'Brien Road", "dir": "E", "codes": ["43E"], "lat": 22.27658, "lng": 114.17319},
  {"id": "45E", "zh": "菲林明道", "en": "Fleming Road", "dir": "E", "codes": ["45E"], "lat": 22.27705, "lng": 114.17541},
  {"id": "47E", "zh": "杜老誌道", "en": "Tonnochy Road", "dir": "E", "codes": ["47E"], "lat": 22.27825, "lng": 114.17774},
  {"id": "49E", "zh": "堅拿道西", "en": "Canal Road West", "dir": "E", "codes": ["49E"], "lat": 22.27931, "lng": 114.18096},
  {"id": "51E", "zh": "波斯富街", "en": "Percival Street", "dir": "E", "codes": ["51E"], "lat": 22.28007, "lng": 114.18299},
  {"id": "53E", "zh": "百德新街", "en": "Paterson Street", "dir": "E", "codes": ["53E"], "lat": 22.27971, "lng": 114.18613},
  {"id": "55E", "zh": "信德街", "en": "Shelter Street", "dir": "E", "codes": ["55E"], "lat": 22.27961, "lng": 114.18789},
  {"id": "57E", "zh": "維多利亞公園", "en": "Victoria Park", "dir": "E", "codes": ["57E"], "lat": 22.28057, "lng": 114.18936},
  {"id": "59E", "zh": "興發街", "en": "Hing Fat Street", "dir": "E", "codes": ["59E"], "lat": 22.28182, "lng": 114.1912},
  {"id": "61E", "zh": "永興街", "en": "Wing Hing Street", "dir": "E", "codes": ["61E"], "lat": 22.28513, "lng": 114.19284},
  {"id": "63E", "zh": "木星街", "en": "Jupiter Street", "dir": "E", "codes": ["63E"], "lat": 22.28642, "lng": 114.19287},
  {"id": "65E", "zh": "炮台山", "en": "Fortress Hill", "dir": "E", "codes": ["65E"], "lat": 22.2892, "lng": 114.19429},
  {"id": "67E", "zh": "春秧街", "en": "Chun Yeung Street", "dir": "E", "codes": ["67E"], "lat": 22.2911, "lng": 114.19671},
  {"id": "69E", "zh": "北角道", "en": "North Point Road", "dir": "E", "codes": ["69E"], "lat": 22.29056, "lng": 114.19707},
  {"id": "71E", "zh": "書局街", "en": "Shu Kuk Street", "dir": "E", "codes": ["71E"], "lat": 22.29129, "lng": 114.20064},
  {"id": "73E", "zh": "電照街", "en": "Tin Chiu Street", "dir": "E", "codes": ["73E"], "lat": 22.2919, "lng": 114.20364},
  {"id": "75E", "zh": "健康西街", "en": "Healthy Street West", "dir": "E", "codes": ["75E"], "lat": 22.29212, "lng": 114.20518},
  {"id": "77E", "zh": "健康東街", "en": "Healthy Street East", "dir": "E", "codes": ["77E"], "lat": 22.29173, "lng": 114.20757},
  {"id": "79E", "zh": "渣華道", "en": "Java Road", "dir": "E", "codes": ["79E"], "lat": 22.29086, "lng": 114.20907},
  {"id": "81E", "zh": "芬尼街", "en": "Finnie Street", "dir": "E", "codes": ["81E"], "lat": 22.2886, "lng": 114.20988},
  {"id": "83E", "zh": "柏架山道", "en": "Mount Parker Road", "dir": "E", "codes": ["83E"], "lat": 22.28575, "lng": 114.21112},
  {"id": "85E", "zh": "船塢里", "en": "Shipyard Lane", "dir": "E", "codes": ["85E"], "lat": 22.2847, "lng": 114.21383},
  {"id": "87E", "zh": "康山", "en": "Kornhill", "dir": "E", "codes": ["87E"], "lat": 22.28466, "lng": 114.21604},
  {"id": "89E", "zh": "太古城道", "en": "Tai Koo Shing Road", "dir": "E", "codes": ["89E"], "lat": 22.28404, "lng": 114.22042},
  {"id": "91E", "zh": "太康街", "en": "Tai Hong Street", "dir": "E", "codes": ["91E"], "lat": 22.28312, "lng": 114.22115},
  {"id": "93E", "zh": "太安街", "en": "Tai On Street", "dir": "E", "codes": ["93E"], "lat": 22.28232, "lng": 114.22178},
  {"id": "95E", "zh": "海富街", "en": "Hoi Foo Street", "dir": "E", "codes": ["95E"], "lat": 22.28043, "lng": 114.22447},
  {"id": "97E", "zh": "西灣河電車廠", "en": "Sai Wan Ho Depot", "dir": "E", "codes": ["97E"], "lat": 22.27961, "lng": 114.225415},
  {"id": "99E", "zh": "南康街", "en": "Nam Hong Street", "dir": "E", "codes": ["99E"], "lat": 22.27879, "lng": 114.22636},
  {"id": "101E", "zh": "柴灣道", "en": "Chai Wan Road", "dir": "E", "codes": ["101E"], "lat": 22.27676, "lng": 114.2293},
  {"id": "105", "zh": "富明街", "en": "Foo Ming Street", "dir": "S", "codes": ["105"], "lat": 22.27934, "lng": 114.18296},
  {"id": "106", "zh": "禮頓道", "en": "Leighton Road", "dir": "S", "codes": ["106"], "lat": 22.277, "lng": 114.1824},
  {"id": "107", "zh": "樂活道", "en": "Broadwood Road", "dir": "S", "codes": ["107"], "lat": 22.27393, "lng": 114.18366},
  {"id": "108", "zh": "黃泥涌道", "en": "Wong Nai Chung Road", "dir": "S", "codes": ["108"], "lat": 22.27178, "lng": 114.18471},
  {"id": "HVT", "zh": "跑馬地", "en": "Happy Valley", "dir": "T", "codes": ["HVT_K", "HVT_B"], "lat": 22.26982, "lng": 114.18415, "terminus": true},
  {"id": "109", "zh": "天主教墳場", "en": "Colonial Cemetery", "dir": "N", "codes": ["109"], "lat": 22.27158, "lng": 114.18036},
  {"id": "110", "zh": "皇后大道東", "en": "Queen's Road East", "dir": "N", "codes": ["110"], "lat": 22.27441, "lng": 114.17942},
  {"id": "111", "zh": "摩利臣山道", "en": "Morrison Hill Road", "dir": "N", "codes": ["111"], "lat": 22.2759, "lng": 114.18059},
  {"id": "112", "zh": "天樂里", "en": "Tin Lok Lane", "dir": "N", "codes": ["112"], "lat": 22.2785, "lng": 114.17963},
];

/** 每個方向嘅站序（行車次序，包埋中途嘅總站） */
export const TRAM_ORDER: Record<'W' | 'E' | 'S' | 'N', string[]> = {"W": ["SKT", "02W", "04W", "06W", "08W", "10W", "12W", "14W", "16W", "18W", "20W", "22W", "24W", "26W", "28W", "30W", "NPT", "32W", "34W", "36W", "38W", "40W", "42W", "44W", "CBT", "46W", "48W", "50W", "52W", "54W", "56W", "58W", "60W", "62W", "64W", "66W", "68W", "70W", "72W", "74W", "76W", "WMT", "78W", "80W", "82W", "84W", "86W", "88W", "90W", "92W", "94W", "96W", "98W", "100W", "102W", "104W"], "E": ["KTT", "01E", "03E", "05E", "07E", "WST", "09E", "11E", "13E", "15E", "17E", "19E", "WMT", "21E", "23E", "25E", "27E", "29E", "31E", "33E", "35E", "37E", "39E", "41E", "43E", "45E", "47E", "49E", "51E", "53E", "55E", "57E", "59E", "61E", "63E", "65E", "67E", "69E", "71E", "73E", "75E", "77E", "79E", "81E", "83E", "85E", "87E", "89E", "91E", "93E", "95E", "97E", "99E", "101E"], "S": ["105", "106", "107", "108", "HVT"], "N": ["109", "110", "111", "112"]};

/** 路線（運輸署 GTFS） */
export const TRAM_ROUTES: TramRoute[] = [
  {"id": "4001", "zh": "筲箕灣 ↔ 上環(西港城)", "en": "Shau Kei Wan ↔ Western Market", "dirs": {"1": ["SKT", "02W", "04W", "06W", "08W", "10W", "12W", "14W", "16W", "18W", "20W", "22W", "24W", "26W", "28W", "30W", "32W", "34W", "36W", "38W", "40W", "42W", "44W", "46W", "48W", "50W", "52W", "54W", "56W", "58W", "60W", "62W", "64W", "66W", "68W", "70W", "72W", "74W", "76W", "WMT"], "2": ["WMT", "21E", "23E", "25E", "27E", "29E", "31E", "33E", "35E", "37E", "39E", "41E", "43E", "45E", "47E", "49E", "51E", "53E", "55E", "57E", "59E", "61E", "63E", "65E", "69E", "71E", "73E", "75E", "77E", "79E", "81E", "83E", "85E", "87E", "89E", "91E", "93E", "95E", "97E", "99E", "101E", "SKT"]}},
  {"id": "4002", "zh": "筲箕灣 ↔ 跑馬地", "en": "Shau Kei Wan ↔ Happy Valley", "dirs": {"1": ["SKT", "02W", "04W", "06W", "08W", "10W", "12W", "14W", "16W", "18W", "20W", "22W", "24W", "26W", "28W", "30W", "32W", "34W", "36W", "38W", "40W", "42W", "44W", "46W", "48W", "105", "106", "107", "108", "HVT"], "2": ["HVT", "109", "110", "111", "112", "49E", "51E", "53E", "55E", "57E", "59E", "61E", "63E", "65E", "69E", "71E", "73E", "75E", "77E", "79E", "81E", "83E", "85E", "87E", "89E", "91E", "93E", "95E", "97E", "99E", "101E", "SKT"]}},
  {"id": "4003", "zh": "堅尼地城 ↔ 跑馬地", "en": "Kennedy Town ↔ Happy Valley", "dirs": {"1": ["KTT", "01E", "03E", "05E", "07E", "09E", "11E", "13E", "15E", "17E", "19E", "21E", "23E", "25E", "27E", "29E", "31E", "33E", "35E", "37E", "39E", "41E", "43E", "45E", "47E", "49E", "105", "106", "107", "108", "HVT"], "2": ["HVT", "109", "110", "111", "112", "52W", "54W", "56W", "58W", "60W", "62W", "64W", "66W", "68W", "70W", "72W", "74W", "76W", "WMT", "78W", "80W", "82W", "84W", "86W", "88W", "90W", "92W", "94W", "96W", "98W", "100W", "102W", "104W", "KTT"]}},
  {"id": "4004", "zh": "石塘咀 ↔ 銅鑼灣", "en": "Shek Tong Tsui ↔ Causeway Bay", "dirs": {"1": ["WST", "09E", "11E", "13E", "15E", "17E", "19E", "21E", "23E", "25E", "27E", "29E", "31E", "33E", "35E", "37E", "39E", "41E", "43E", "45E", "47E", "49E", "51E", "53E", "CBT"], "2": ["CBT", "46W", "48W", "50W", "52W", "54W", "56W", "58W", "60W", "62W", "64W", "66W", "68W", "70W", "72W", "74W", "76W", "WMT", "78W", "80W", "82W", "84W", "86W", "88W", "90W", "WST"]}},
  {"id": "4005", "zh": "北角 ↔ 石塘咀", "en": "North Point ↔ Shek Tong Tsui", "dirs": {"1": ["NPT", "32W", "34W", "36W", "38W", "40W", "42W", "44W", "46W", "48W", "50W", "52W", "54W", "56W", "58W", "60W", "62W", "64W", "66W", "68W", "70W", "72W", "74W", "76W", "WMT", "78W", "80W", "82W", "84W", "86W", "88W", "90W", "WST"], "2": ["WST", "09E", "11E", "13E", "15E", "17E", "19E", "21E", "23E", "25E", "27E", "29E", "31E", "33E", "35E", "37E", "39E", "41E", "43E", "45E", "47E", "49E", "51E", "53E", "55E", "57E", "59E", "61E", "63E", "65E", "67E", "NPT"]}},
  {"id": "4007", "zh": "筲箕灣 ↔ 堅尼地城", "en": "Shau Kei Wan ↔ Kennedy Town", "dirs": {"1": ["SKT", "02W", "04W", "06W", "08W", "10W", "12W", "14W", "16W", "18W", "20W", "22W", "24W", "26W", "28W", "30W", "32W", "34W", "36W", "38W", "40W", "42W", "44W", "46W", "48W", "50W", "52W", "54W", "56W", "58W", "60W", "62W", "64W", "66W", "68W", "70W", "72W", "74W", "76W", "WMT", "78W", "80W", "82W", "84W", "86W", "88W", "90W", "92W", "94W", "96W", "98W", "100W", "102W", "104W", "KTT"], "2": ["KTT", "01E", "03E", "05E", "07E", "09E", "11E", "13E", "15E", "17E", "19E", "21E", "23E", "25E", "27E", "29E", "31E", "33E", "35E", "37E", "39E", "41E", "43E", "45E", "47E", "49E", "51E", "53E", "55E", "57E", "59E", "61E", "63E", "65E", "69E", "71E", "73E", "75E", "77E", "79E", "81E", "83E", "85E", "87E", "89E", "91E", "93E", "95E", "97E", "99E", "101E", "SKT"]}},
];
