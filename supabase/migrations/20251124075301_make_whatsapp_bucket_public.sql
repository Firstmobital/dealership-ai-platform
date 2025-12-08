update storage.buckets
set public = true
where id = 'whatsapp-media';

update storage.buckets
set public = false
where id = 'knowledge-base';
