create table rnt_menu_tabs
( tab_name        varchar2(32) not null
, tab_title       varchar2(32) not null
, parent_tab      varchar2(32)
, display_seq     number
, tab_href        varchar2(128)
, constraint rnt_menu_tabs_pk primary key (tab_name)
, constraint rnt_menu_tabs_r1 foreign key (parent_tab)
  references rnt_menu_tabs (tab_name));

create index rnt_menu_tabs_n1 on rnt_menu_tabs (parent_tab);

create table rnt_menu_roles
( tab_name       varchar2(32) not null
, role_id        number       not null
, constraint rnt_menu_roles_pk primary key (tab_name, role_id)
, constraint rnt_menu_roles_r1 foreign key (tab_name)
  references rnt_menu_tabs (tab_name)
, constraint rnt_menu_roles_r2 foreign key (role_id)
  references rnt_user_roles (role_id));

create index rnt_menu_roles_n1 on rnt_menu_roles (role_id);

create table rnt_menus
( tab_name        varchar2(32) not null
, parent_tab      varchar2(32) not null
, menu_name       varchar2(32) not null
, menu_title      varchar2(32) not null
, display_seq     number
, constraint rnt_menus_pk primary key (tab_name, menu_name)
, constraint rnt_menus_r1 foreign key (tab_name)
  references rnt_menu_tabs (tab_name));

create table rnt_menu_links
( tab_name        varchar2(32) not null
, menu_name       varchar2(32) not null
, link_title      varchar2(32) not null
, link_url        varchar2(128)
, display_seq     number
, constraint rnt_menu_links_pk primary key (tab_name, menu_name, link_title)
, constraint rnt_menu_links_r1 foreign key (tab_name, menu_name)
  references rnt_menus (tab_name, menu_name));

create table rnt_menu_pages
( tab_name        varchar2(32) not null
, menu_name       varchar2(32) not null
, page_name       varchar2(32) not null
, sub_page        varchar2(32) not null
, page_title      varchar2(32) not null
, display_seq     number
, header_content  xmltype
, body_content    clob
, constraint rnt_menu_pages_pk primary key 
     (tab_name, menu_name, page_name, sub_page)
, constraint rnt_menu_pages_r1 foreign key (tab_name, menu_name)
  references rnt_menus (tab_name, menu_name));

comment on table rnt_menu_tabs is
'Stores menu tab definitions.  The config_menu program reads this table to build the menu array.';

comment on table rnt_menu_roles is
'Controls access the menu tabs.  The config_menu program reads this table to build an array of user roles that are able to access the menu tab.';

comment on column rnt_menu_roles.tab_name is 
'Records the name of the tab that the role is able to access.  fk to rnt_menu_tabs.';

comment on column rnt_menu_roles.role_id is
'Records the role_id for roles that have been granted access to the menu tab.';

comment on table rnt_menu_tabs is
'Records details of L1 and L2 tabs in visulate''s menu system.  L1 tabs are the top tabs displayed in the menu bar.  L2 tabs are subtabs that appear below them.  L2 tabs identify the L1 menu that they belong to via the parent_tab foreign key column.';

comment on column rnt_menu_tabs.tab_name is 'A unique name that identifies the tab';
comment on column rnt_menu_tabs.tab_title is 'The display name that will be shown on the menu.';
comment on column rnt_menu_tabs.parent_tab is 'The name of the L1 tab that this tab belongs to';
comment on column rnt_menu_tabs.display_seq is 'Sort order for menu tabs';
comment on column rnt_menu_tabs.tab_href is 'The href that will be included in the global_menu_data array for this tab.';


comment on table rnt_menus is
'Records details of L3 menus for display on the left of the screen';

comment on column rnt_menus.tab_name is 'The name of the tab that this menu belongs to.  FK to rnt_menu_tabs.';
comment on column rnt_menus.menu_name is 'Unique name for the menu in the context of the tab.';
comment on column rnt_menus.menu_title is 'Display title shown at the top of the menu';
comment on column rnt_menus.display_seq is 'Sort order for the menu if there is more than one menu on a tab.';


comment on table rnt_menu_pages is
'Records content of static html pages.  Each page is identified by its location, page name and sub-page number.  Sub-pages are used to limit the size of large pages.  A page can be broken down into numbered sub pages.';

comment on column rnt_menu_pages.tab_name is 'The tab that the page has been placed in.';
comment on column rnt_menu_pages.menu_name is 'The menu that is used to access the page.';
comment on column rnt_menu_pages.page_name is 'Unique name for the page in the context of a menu';
comment on column rnt_menu_pages.sub_page is 'Sub page number';
comment on column rnt_menu_pages.page_title is 'Title to display on the menu';
comment on column rnt_menu_pages.display_seq is 'Sort order for this item in the menu';
comment on column rnt_menu_pages.header_content is 'HTML header text';
comment on column rnt_menu_pages.body_content is 'HTML body text.';


comment on table rnt_menu_links is 'Stores hypertext links for inclusion in a menu';
comment on column rnt_menu_links.tab_name is 'The tab that the link has been placed in.';
comment on column rnt_menu_links.menu_name is 'The menu that is used to access the link.';
comment on column rnt_menu_links.link_title is 'Title to display on the menu for the link';
comment on column rnt_menu_links.link_url is 'Hypertext link location';
comment on column rnt_menu_links.display_seq is 'Sort order for menu items';


