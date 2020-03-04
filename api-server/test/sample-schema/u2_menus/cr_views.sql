create or replace view RNT_MENU_TABS_V as
select TAB_NAME
,      TAB_TITLE
,      PARENT_TAB
,      DISPLAY_SEQ
,      TAB_HREF
,      rnt_sys_checksum_rec_pkg.get_checksum('TAB_NAME='||TAB_NAME
                                           ||'TAB_TITLE='||TAB_TITLE
                                           ||'PARENT_TAB='||PARENT_TAB
                                           ||'DISPLAY_SEQ='||DISPLAY_SEQ
                                           ||'TAB_HREF='||TAB_HREF) as CHECKSUM
from RNT_MENU_TABS;

create or replace view RNT_MENU_ROLES_V as
select TAB_NAME
,      ROLE_ID
,      rnt_sys_checksum_rec_pkg.get_checksum('TAB_NAME='||TAB_NAME||'ROLE_ID='||ROLE_ID) as CHECKSUM
from RNT_MENU_ROLES;

create or replace view RNT_MENUS_V as
select TAB_NAME
,      MENU_NAME
,      MENU_TITLE
,      DISPLAY_SEQ
,      rnt_sys_checksum_rec_pkg.get_checksum('TAB_NAME='||TAB_NAME
                                           ||'MENU_NAME='||MENU_NAME
                                           ||'MENU_TITLE='||MENU_TITLE
                                           ||'DISPLAY_SEQ='||DISPLAY_SEQ) as CHECKSUM
from RNT_MENUS;

create or replace view RNT_MENU_LINKS_V as
select TAB_NAME
,      MENU_NAME
,      LINK_TITLE
,      LINK_URL
,      DISPLAY_SEQ
,      rnt_sys_checksum_rec_pkg.get_checksum('TAB_NAME='||TAB_NAME
                                           ||'MENU_NAME='||MENU_NAME
                                           ||'LINK_TITLE='||LINK_TITLE
                                           ||'LINK_URL='||LINK_URL
                                           ||'DISPLAY_SEQ='||DISPLAY_SEQ) as CHECKSUM
from RNT_MENU_LINKS;

@@rnt_menu_pages_v