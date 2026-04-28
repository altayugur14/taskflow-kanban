# TaskFlow Kanban

TaskFlow is a focused Kanban project-management app built for the assignment brief. It supports Supabase authentication, boards, columns, cards, editable card details, delete actions, labels, due dates, responsible person text, activity history, draggable cards and columns, persisted ordering after refresh, mobile-friendly usage, and Vercel deployment.

Live demo: https://taskflow-kanban-xi.vercel.app

## Reviewer Quick Test

1. Open https://taskflow-kanban-xi.vercel.app.
2. Register with any test email/password.
3. Email confirmation is intentionally disabled for this demo only so reviewers can enter immediately. This is for demo purposes only.
4. Create a sample board from the sidebar.
5. Drag cards within one column, across columns, and into an empty column.
6. Drag columns to reorder them.
7. Edit a card title, description, label, due date, and responsible person.
8. Move a card across columns and check the recent activity list.
9. Create a temporary card, column, or board and confirm delete actions work.
10. Refresh the page and confirm the selected board plus card/column order are preserved.

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

Run `supabase/schema.sql` in the Supabase SQL editor. It creates or updates the `boards`, `columns`, `cards`, and `card_activity` tables, enables Row Level Security, grants authenticated table access, and adds policies so users can only access boards they own.

## Supabase and Vercel Notes

For the review demo, I disabled email confirmation intentionally so the evaluator can register and test without email friction. This should only be done for the demo. A real product should use a stricter auth setup.

In Supabase Authentication settings:

- Disable email confirmation for the demo only.
- Add the localhost URL while developing.
- Add the final Vercel URL before deployed testing.

The Vercel project must define:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

After deployment, I repeat the quick test on the Vercel URL because final acceptance should be based on the deployed app, not only localhost.

## English Implementation Notes

### Data Model and Security

I kept the data model intentionally direct:

- `boards` belong to one authenticated user through `owner_id`.
- `columns` belong to a board.
- `cards` belong to both a board and a column.
- `card_activity` records cross-column card moves.

The important consistency rule is that a card should never point to a column from another board. I enforce that with a database trigger, not only frontend checks. That means even if a bad request is sent manually, Supabase should reject a card move where `cards.column_id` does not belong to `cards.board_id`.

Row Level Security is enabled on the app tables. A user can only read and mutate boards they own. Columns, cards, and activity rows are only accessible through owned boards. I did not want to rely only on frontend filtering because that would make the UI look correct while still leaving the database too permissive.

For activity history, I store copied text such as `card_title`, `from_column_title`, and `to_column_title`. That is deliberate: activity history is closer to an audit log than a live relational view, so it should still remain readable even if a card or column is later deleted.

### Drag-and-Drop Library Choice

I chose `dnd-kit` because it is modern, maintained, React-friendly, and flexible with pointer/touch sensors. The project asks specifically about mobile usability and drag-and-drop correctness, so I wanted a library that lets me control sensors, overlays, empty drop zones, and different drag types without fighting the framework.

I considered the other options:

- `react-beautiful-dnd`: I did not choose it because it is no longer actively maintained.
- `@hello-pangea/dnd`: This is a practical maintained fork and could work well for a classic list/board UI. I still preferred `dnd-kit` because it felt more flexible for touch behavior, empty column drop zones, and supporting both card drag and column drag.
- SortableJS: It is powerful and mature, but it is closer to direct DOM manipulation. In React, I prefer keeping ordering in state and database rows, then letting React render from that state. With SortableJS I would usually need more manual synchronization between DOM changes and React state.
- Native browser drag-and-drop: It avoids another dependency, but mobile/touch behavior is weaker and it is harder to make the experience consistent.

So my decision was not just "dnd-kit is popular"; it matched the specific constraints of this assignment: maintained library, mobile-aware sensors, flexible architecture, and clean React integration.

### Ordering Strategy

Cards and columns store a numeric `position` value in Supabase. The ordering is not just local React state, so refreshing the page keeps the same order.

For cards, I generally calculate a fractional position between neighboring cards. For example, if one card has position `1000` and the next has `2000`, a card inserted between them can use `1500`. This means I do not need to rewrite every card in the column for every drag. If positions ever become too close together, the app can renormalize the affected column.

For columns, I chose a simpler approach. Column counts are usually small, so after column reordering I recalculate the column positions. That is easier to reason about, and it keeps the column order stable without adding unnecessary complexity.

Drag updates are optimistic. The UI moves immediately so the app feels responsive. Then Supabase persists the new `board_id`, `column_id`, and `position`. If the Supabase update fails, the app shows an error and rolls back or reloads the board so unsaved ordering is not silently displayed.

### Mobile Behavior

On mobile, the board uses horizontal scrolling. I did that so columns remain readable instead of shrinking into tiny unusable panels.

For drag, I use movement/delay constraints so scrolling and dragging do not conflict as much on touch devices. I also kept a column dropdown on each card as a deliberate fallback. Drag-and-drop can be awkward on some mobile browsers, so the dropdown gives the user a reliable non-drag way to move a card.

For column reordering, I used a small handle in the column header. I did not make the entire column draggable because cards are already draggable, and making too much of the surface draggable would increase accidental moves.

### Bonus Scope and Tradeoffs

After the required MVP was stable, I added:

- Column reordering
- Card labels
- Due dates
- Responsible person text
- Activity history for cross-column card moves
- Board, column, and card delete actions
- Restoring the selected board after refresh

I intentionally skipped board sharing and real-time collaboration. They are valuable features, but doing them properly would require a larger permission model, read-only/edit roles, share tokens or membership tables, more RLS policies, and conflict handling. Adding them quickly would create more risk than value for this assignment.

I also did not prioritize screenshots/GIFs because they are presentation polish, not core functionality from the task text. I focused on the deployed app working correctly.

### Performance

The main performance risk is repeatedly filtering and sorting all cards for every column. I group cards by column with memoized computation so the board render stays reasonable. Fractional card positions also reduce database writes because most card moves update only one card.

If this became a real product with thousands of cards on one board, I would consider virtualization and more targeted server queries. For this assignment-sized Kanban app, the current approach is a good balance between correctness and simplicity.

## Türkçe Değerlendirme Notlarım

### Veri Modeli ve Güvenlik

Bu projede veri modelini `board -> sütun -> kart` ilişkisini açık tutacak şekilde kurdum.

- `boards` tablosundaki her board, `owner_id` alanı üzerinden `auth.uid()` ile bir kullanıcıya bağlıdır.
- `columns` tablosundaki her sütun bir board'a bağlıdır.
- `cards` tablosundaki her kart hem bir board'a hem de bir sütuna bağlıdır.
- Kartlarda ek olarak opsiyonel `label`, `due_date` ve `responsible` alanları vardır. Bunları küçük bonus özellikler olarak ekledim.
- `card_activity` tablosu kartın hangi sütundan hangi sütuna taşındığını kayıt altına alır. Bunu sadece kart farklı bir sütuna taşındığında yazıyorum; aynı sütun içindeki küçük sıralama değişikliklerini history'yi şişirmemek için loglamıyorum.

Row Level Security (RLS) politikaları, erişimi frontend filtrelerine bırakmak yerine kullanıcının ilgili board'un sahibi olup olmadığını veritabanı seviyesinde kontrol eder.

Veritabanındaki trigger, bir kartın kendi board'u dışındaki bir sütuna eklenmesini veya taşınmasını engeller. Yani `card.column_id` başka bir board'a aitse işlem reddedilir. Bu benim için önemliydi, çünkü veri tutarlılığı sadece frontend'de kontrol edilirse kötü veya hatalı bir request yine de veritabanını bozabilir.

Activity history tarafında kart ve sütun isimlerini ayrıca sakladım. Bunu audit log mantığıyla düşündüm: bir kart veya sütun sonra silinse bile geçmiş hareketin okunabilir kalması daha doğru olur.

### Sürükle-Bırak Kütüphanesi Seçimi

Bu projede `dnd-kit` kullandım çünkü React ile uyumlu, esnek, hâlâ bakımı yapılan ve pointer/touch sensor desteği güçlü bir kütüphane. Bu assignment için aşağıda belirttiğim diğer seçeneklere göre daha uygun buldum:

- `react-beautiful-dnd`: aktif olarak desteklenmiyor.
- `@hello-pangea/dnd`: `react-beautiful-dnd` devamı olarak kullanılabilir bir fork. Klasik liste/board yapısı için iyi bir seçenek olabilir, fakat custom touch davranışı, empty drop zone mantığı ve hem kart hem sütun drag davranışını birlikte yönetme açısından `dnd-kit` bana daha esnek geldi.
- SortableJS: Güçlü ve köklü bir alternatif, ama React'in state modeli immutable ve declarative çalıştığı için SortableJS'in doğrudan DOM üzerinde değişiklik yapma yaklaşımını bu proje için daha riskli buldum. React ile kullanırken genelde DOM elementini manuel bağlamak, SortableJS'i manuel başlatmak ve sıralama sonucunu tekrar React state'e senkronize etmek gerekir. Bu, React'in "DOM'u ben yönetirim, sen state'i güncelle" yaklaşımıyla biraz ters düşüyor.
- Native browser drag-and-drop: Ek kütüphane gerektirmemesi avantaj, ama mobil/touch desteği daha zayıf ve kullanıcı deneyimi daha tutarsız olabilir.

Bu yüzden `dnd-kit` seçimini özellikle mobil uyumluluk, destek durumu, esneklik ve React mimarisi açısından daha bilinçli buldum.

### Sıralama Stratejisi

Kartlar ve sütunlar veritabanında numeric `position` alanı ile sıralanır. Kart veya sütun taşındığında UI önce optimistik olarak güncellenir; böylece kullanıcı hareketin sonucunu anında görür. Ardından yeni sıralama Supabase'e kaydedilir.

Yeni kart `position` değeri genellikle komşu kartların pozisyonları arasından hesaplanır. Örneğin iki kartın pozisyonları 1000 ve 2000 ise araya taşınan karta 1500 verilebilir. Böylece her taşıma işleminde tüm sütundaki kartları baştan yazmanın lüzumu kalmaz.

Eğer pozisyon değerleri zamanla birbirine çok yaklaşırsa, sadece ilgili sütundaki kartlar yeniden normalize edilir. Sütun sayısı çok daha az olduğu için sütun sıralamasında okunabilir ve güvenilir kalması adına sütun pozisyonlarını yeniden hesaplıyorum.

Supabase update işlemi başarısız olursa UI hata gösterir ve önceki state'e döner veya board verisini tekrar çeker. Böylece kullanıcı ekranda kaydedilmemiş, bozuk veya anlamsız bir sıralama görmeye devam etmez.

### Mobil Davranış

Kanban board küçük ekranlarda yatay scroll ile çalışır. Sütun genişlikleri sabit tutulduğu için kartlar daralıp okunmaz hale gelmez; kullanıcı sütunlar arasında yatay kaydırarak gezebilir.

Sürükle-bırak tarafında movement/delay constraint kullandım. Bunun amacı mobilde sayfa kaydırma ile kart sürüklemenin birbirine karışmasını azaltmaktır.

Ayrıca her kartta sütun seçimi için bir dropdown bulunur. Bu bilinçli bir mobil fallback'tir. Mobilde drag-and-drop bazı cihazlarda veya tarayıcılarda daha zor hissedebilir; dropdown sayesinde kullanıcı sürüklemeden de kartı başka bir sütuna taşıyabilir.

Sütun sıralaması için ayrı bir küçük drag handle kullandım. Kartların kendisi zaten sürüklenebilir olduğu için sütunun tamamını drag alanı yapmak mobilde ve masaüstünde yanlışlıkla sütun taşımaya sebep olabilirdi.

### Sütunların Sırası Değiştirilebilir mi?

Evet, bunu bonus olarak ekledim. Sütunlar `position` alanına göre sıralanıyor ve kullanıcı sütun başlığındaki küçük handle ile sütunların yerini değiştirebiliyor.

Sütunların tamamını sürükleme alanı yapmadım. Bunun nedeni kartların da sürüklenebilir olması. Eğer sütunun büyük kısmı drag alanı olsaydı, kart taşımaya çalışırken yanlışlıkla sütun taşımak daha kolay olurdu.

### Kartlara Etiket, Son Teslim Tarihi, Sorumlu Kişi

Bu üç alanı ekledim:

- Etiket: Kartı hızlı sınıflandırmak için.
- Son teslim tarihi: İşin zaman hassasiyetini göstermek için.
- Sorumlu kişi: Basit bir text alanı olarak ekledim.

48 saatlik kapsam için gerçek multi-user assignee modeli yerine basit responsible text alanı daha doğru geldi. Gerçek assignee sistemi kullanıcı arama, paylaşım, izinler ve takım modeli gerektirirdi. Bu da assignment'ın ana odağı olan drag-and-drop ve sıralama kalitesinden dikkat dağıtabilirdi.

### Board Paylaşma Özelliği Olacak mı?

Bu sürümde board sharing eklemedim. Çünkü düzgün yapılırsa sadece bir buton eklemekten daha fazlası gerekir:

- Read-only mi edit yetkisi mi olacak?
- Paylaşım linki mi olacak, kullanıcı bazlı davet mi olacak?
- RLS politikaları shared board'ları nasıl ayıracak?
- Birden fazla kullanıcı aynı anda düzenlerse çakışmalar nasıl çözülecek?

Bunları hızlıca eklemek güvenlik riskini artırabilirdi. Bu yüzden paylaşımı bilinçli olarak erteledim. Temel Kanban akışını güvenilir yapmak bu assignment için daha önemliydi.

### Aktivite Geçmişi Değerli mi?

Evet, değerli olduğunu düşündüğüm için bonus olarak ekledim. Kart farklı bir sütuna taşındığında activity history kaydı oluşuyor.

Aynı sütun içindeki küçük sıralama değişikliklerini loglamadım, çünkü activity listesini gereksiz kalabalık yapabilirdi. Bu projede activity history'nin en anlamlı kısmı kartın durum değişimi, yani bir sütundan başka bir sütuna geçmesi.

### Performans

Çok sayıda kart olduğunda asıl risk her render'da tüm kartları her sütun için tekrar filtrelemek ve sıralamaktır. Bu yüzden kartları sütuna göre gruplayan hesaplamayı `useMemo` ile yaptım.

Kart sıralamasında fractional `position` kullandığım için çoğu taşıma işleminde sadece taşınan kart güncellenir. Bu da hem UI tarafında hem Supabase yazma maliyetinde daha kontrollü bir çözüm sağlar.

Sütunlar daha az sayıda olduğu için sütun reorder sırasında tüm sütun pozisyonlarını yeniden yazmak kabul edilebilir ve daha okunabilir bir çözüm oldu.

Çok büyük ölçekte virtualization gibi ek optimizasyonlar düşünülebilir, ama bu assignment kapsamındaki Kanban MVP için mevcut çözüm yeterli.

### Kapsam Kararlarım

Assignment notlarında özellikle güvenilir drag-and-drop, sıralamanın refresh sonrası korunması, veri modelinin tutarlılığı, mobil kullanılabilirlik ve kod/implementasyon kalitesine dikkat çekildiğini fark ettim. Bu yüzden önceliğim çok fazla yarım özellik eklemek değil, temel Kanban akışını doğru ve stabil çalıştırmak oldu.

Önceliklendirdiğim kısımlar:

- Auth
- Board/column/card CRUD
- Kart başlığı ve açıklaması düzenleme
- Kartlara opsiyonel label, due date ve responsible ekleme
- `dnd-kit` ile drag-and-drop
- Sıralamanın Supabase'de kalıcı tutulması
- Supabase RLS/security
- Mobil kullanılabilirlik
- Vercel deployment hazırlığı
- Board, sütun ve kart silme aksiyonları
- Bonus olarak sütun sıralama
- Bonus olarak kart hareketleri için activity history

Bilinçli olarak ertelediğim özellikler:

- Board sharing
- Real-time collaboration
- Büyük ölçek için virtualization
- Ekran görüntüsü/GIF gibi sunum polishleri

MVP kısmını hallettikten sonra etiket, son teslim tarihi, responsible alanı, sütun sıralama, activity history ve delete aksiyonları gibi düşük/orta riskli özellikleri bonus olarak ekledim. Board sharing ve real-time collaboration ise RLS, izin modeli ve birlikte düzenleme beklentisini ciddi şekilde büyüttüğü için bu aşamada bilerek erteledim.

## Definition of Done

Bu proje, reviewer aşağıdaki akışı deployed Vercel linki üzerinden tamamlayabildiğinde done kabul edilir:

- Vercel URL üzerinden uygulamayı açmak.
- Email confirmation beklemeden register/login olmak.
- Sample board oluşturmak veya mevcut board açmak.
- Board, sütun ve kart oluşturmak.
- Board, sütun ve kart silmek.
- Kart başlığını, açıklamasını, etiketini, son teslim tarihini ve sorumlu kişisini düzenlemek.
- Kartları aynı sütun içinde taşımak.
- Kartları farklı sütunlar arasında taşımak.
- Kartları boş sütuna taşımak.
- Sütunların sırasını değiştirmek.
- Kart farklı bir sütuna taşındığında activity history kaydını görmek.
- Sayfayı refresh edip seçili board'un, kart sırasının ve sütun sırasının korunduğunu görmek.
- Mobil genişlikte uygulamanın bozulmadan çalıştığını görmek.
- README üzerinden teknik kararları ve tradeoff'ları anlayabilmek.
