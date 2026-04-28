# TaskFlow Kanban

TaskFlow is a focused Kanban project-management app built for the assignment brief. It supports real Supabase accounts, boards, columns, cards, card detail editing, optional card labels/due dates, persisted drag-and-drop ordering, mobile-friendly usage, and Vercel deployment.

Live demo: https://taskflow-kanban-xi.vercel.app

## If you are a Reviewer, Quick Test steps:

1. Open https://taskflow-kanban-xi.vercel.app.
2. Register with any test email/password or use the demo account provided.
3. Email confirmation is disabled for this demo only so reviewers can enter immediately.
4. Create a sample board from the sidebar.
5. Drag cards within one column, across columns, and into an empty column.
6. Edit a card and optionally add a label and due date.
7. Refresh the page and confirm the order remains the same.

## Local Setup

```bash
npm install
npm run dev
```

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Run `supabase/schema.sql` in the Supabase SQL editor. It creates or updates the `boards`, `columns`, and `cards` tables, enables rls, grants authenticated table access, and adds policies so users can only access boards they own.

## Supabase Auth Setup

In Supabase Authentication settings:

- Disable email confirmation if you want.
- Add the localhost URL to allowed redirect/site URLs while developing.
- Add the final Vercel URL before deployed testing.

The Vercel project must define:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Deploy from the project root with:

```bash
vercel deploy
```

Open the deployed URL and repeat the quick test there.

## Türkçe Değerlendirme Notlarım

## Veri Modeli ve Güvenlik

- `boards` tablosundaki her board, `owner_id` alanı üzerinden `auth.uid()` ile bir kullanıcıya bağlıdır.
- `columns` tablosundaki her sütun bir board'a bağlıdır.
- `cards` tablosundaki her kart hem bir board'a hem de bir sütuna bağlıdır.
- Kartlarda ek olarak opsiyonel `label` ve `due_date` alanları vardır. Bunları küçük bonus özellikler olarak ekledim.
- Row Level Security (RLS) politikaları, erişimi frontend filtrelerine bırakmak yerine kullanıcının ilgili board'un sahibi olup olmadığını veritabanı seviyesinde kontrol eder.
- Veritabanındaki trigger, bir kartın kendi board'u dışındaki bir sütuna eklenmesini veya taşınmasını engeller. Yani `card.column_id` başka bir board'a aitse işlem reddedilir.

## Sürükle-Bırak Kütüphanesi Seçimi

Bu projede `dnd-kit` kullandım çünkü React ile uyumlu, esnek, hâlâ bakımı yapılan ve pointer/touch sensor desteği güçlü bir kütüphane. Bu assignment için aşağıda belirttiğim diğer seçeneklere göre daha uygun buldum:

- `react-beautiful-dnd`: aktif olarak desteklenmiyor.
- `@hello-pangea/dnd`: `react-beautiful-dnd` devamı olarak kullanılabilir bir fork, fakat custom touch davranışı ve esnek drop alanlarını `dnd-kit` ye kıyasla daha uyumsuz buldum.
- SortableJS: Güçlü ve köklü bir alternatif, ama React'in state modeli immutable ve declarative çalıştığı ve SortableJS ise doğrudan DOM üzerinde değişiklik yapma yaklaşımına daha yakın olduğu için burada diğeri daha uygun geldi. React ile kullanırken genelde `useEffect` içinde DOM elementini manuel bulmak, SortableJS'i manuel başlatmak ve sonra sıralama sonucunu tekrar React state'e senkronize etmeniz gerekir. Bu, React'in “DOM'u ben yönetirim, sen state'i güncelle” yaklaşımına biraz anlamsız düştüğü için bu proje için `dnd-kit` daha doğru seçim oldu.
- Native browser drag-and-drop: Ek kütüphane gerektirmemesi avantaj ama mobil/touch desteği daha zayıf ve kullanıcı deneyimi sıkıntılı, doğal olarak.

## Sıralama Stratejisi

Kartlar ve sütunlar veritabanında numeric `position` alanı ile sıralanır. Kart taşındığında UI önce optimistik olarak güncellenir; böylece kullanıcı hareketin sonucunu anında görür. Ardından yeni sıralama Supabase'e kaydedilir.

Yeni `position` değeri genellikle komşu kartların pozisyonları arasından hesaplanır. Örneğin iki kartın pozisyonları 1000 ve 2000 ise araya taşınan karta 1500 verilebilir. Böylece her taşıma işleminde tüm sütundaki kartları baştan yazmanın lüzumu kalmaz. Eğer pozisyon değerleri zamanla birbirine çok yaklaşırsa, sadece ilgili sütundaki kartlar yeniden normalize edilir.

Supabase update işlemi başarısız olursa UI hata gösterir ve önceki state'e döner veya board verisini tekrar çeker. Böylece kullanıcı ekranda kaydedilmemiş, bozuk veya anlamsız bir sıralama görmeye devam etmez.

## Mobil Davranış

Kanban board küçük ekranlarda yatay scroll ile çalışır. Sütun genişlikleri sabit tutulduğu için kartlar daralıp okunmaz hale gelmez; kullanıcı sütunlar arasında yatay kaydırarak gezebilir.

Sürükle-bırak tarafında movement/delay constraint kullandım. Bunun amacı mobilde sayfa kaydırma ile kart sürüklemenin birbirine karışmasını azaltmaktır.

Ayrıca her kartta sütun seçimi için bir dropdown bulunur. Bu bilinçli bir mobil fallback'tir. Mobilde drag-and-drop bazı cihazlarda veya tarayıcılarda daha zor hissedebilir; dropdown sayesinde kullanıcı sürüklemeden de kartı başka bir sütuna taşıyabilir.

## Kapsam Kararları

Assignment notlarında özellikle güvenilir drag-and-drop, sıralamanın refresh sonrası korunması, veri modelinin tutarlılığı, mobil kullanılabilirlik ve kod/implementasyon kalitesine dikkat çektiğinizi fark ettim. Bu yüzden önceliğim çok fazla yarım özellik eklemek değil, temel Kanban akışını doğru ve stabil çalıştırmak oldu.

Önceliklendirdiğim kısımlar:

- Auth
- Board/column/card CRUD
- Kart başlığı ve açıklaması düzenleme
- Kartlara opsiyonel label ve due date ekleme
- `dnd-kit` ile drag-and-drop
- Sıralamanın Supabase'de kalıcı tutulması
- Supabase RLS/security
- Mobil kullanılabilirlik
- Vercel deployment hazırlığı

Bilinçli olarak ertelediğim özellikler:

- Delete aksiyonları
- Screenshots/GIFs
- Assignees
- Board sharing
- Activity history
- Real-time collaboration
- Column reordering

MVP kısmını hallettikten sonra etiket ve son teslim tarihi gibi düşük riskli özellikleri küçük bonuslar olarak ekledim. Paylaşım, aktivite geçmişi ve gerçek assignee modeli gibi özellikleri ise veri modeli ve güvenlik kapsamını büyüttüğü için bu aşamada bilerek erteledim.

## Definition of Done

Bu proje, reviewer aşağıdaki akışı deployed Vercel linki üzerinden tamamlayabildiğinde done kabul edilir(verilen proje açıklamasına göre):

- Uygulamayı Vercel URL üzerinden açmak.
- Email confirmation beklemeden register veya login olmak.
- Sample board oluşturmak veya mevcut bir board açmak.
- Board, sütun ve kart oluşturmak.
- Kart başlığını, açıklamasını, etiketini ve son teslim tarihini düzenlemek.
- Kartları aynı sütun içinde taşımak.
- Kartları farklı sütunlar arasında taşımak.
- Kartları boş sütuna taşımak.
- Sayfayı refresh edip kart sırasının ve sütun konumlarının korunduğunu görmek.
- Mobil genişlikte uygulamanın bozulmadan kullanılabildiğini görmek.
- README üzerinden teknik kararları ve tradeoff'ları anlayabilmek.
