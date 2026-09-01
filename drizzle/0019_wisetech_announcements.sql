CREATE TABLE "site_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_en" text NOT NULL,
	"title_zh_hk" text NOT NULL,
	"cta_label_en" text NOT NULL,
	"cta_label_zh_hk" text NOT NULL,
	"href" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_announcements_window_check" CHECK ("site_announcements"."ends_at" > "site_announcements"."starts_at"),
	CONSTRAINT "site_announcements_priority_check" CHECK ("site_announcements"."priority" >= 0 AND "site_announcements"."priority" <= 1000),
	CONSTRAINT "site_announcements_title_en_check" CHECK (char_length(btrim("site_announcements"."title_en", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) BETWEEN 1 AND 180),
	CONSTRAINT "site_announcements_title_zh_hk_check" CHECK (char_length(btrim("site_announcements"."title_zh_hk", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) BETWEEN 1 AND 180),
	CONSTRAINT "site_announcements_cta_label_en_check" CHECK (char_length(btrim("site_announcements"."cta_label_en", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) BETWEEN 1 AND 60),
	CONSTRAINT "site_announcements_cta_label_zh_hk_check" CHECK (char_length(btrim("site_announcements"."cta_label_zh_hk", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) BETWEEN 1 AND 60),
	CONSTRAINT "site_announcements_href_check" CHECK ("site_announcements"."href" IN ('/', '/join', '/about', '/about/chairman', '/about/committees', '/about/history', '/membership', '/showcase', '/launchpad', '/ai-ops', '/events', '/news', '/programs/cpai', '/programs/hkict', '/programs/tct', '/programs/asa', '/contact', '/privacy', '/ai-transparency'))
);
--> statement-breakpoint
CREATE INDEX "site_announcements_active_idx" ON "site_announcements" USING btree ("archived_at","published_at","starts_at","ends_at","priority","id");