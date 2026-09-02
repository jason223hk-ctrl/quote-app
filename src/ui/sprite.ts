/*
 * stage57 原型嗰 46 個 icon symbol，原封不動搬過嚟。
 * ⛔ 一個 path 都冇改 —— 改咗就同原型對唔返。
 *
 * 點解係字串唔係 JSX：SVG 屬性（stroke-width、stroke-linecap…）
 * 轉做 JSX 要逐個改駝峰，四十六個 symbol 改錯一個好難捉。
 * 用字串就係原文，⛔ 冇轉換、冇走樣。
 * 內容係我哋自己嘅靜態檔，⛔ 唔含任何用家輸入，所以 innerHTML 安全。
 */
export const ICON_SPRITE = `<symbol id="01_bottom_nav__home_seedling" viewBox="0 0 24 24">
<g transform="translate(0.1641 0.0469)">
<path d="M12 20V10.2"/>
<path d="M12 13.1c-4.0 0-6.5-2.5-6.7-6.1 4.1-.2 6.7 2.2 6.7 6.1Z"/>
<path d="M12 10.2c0-3.8 2.4-6.2 6.4-6.3.1 4-2.3 6.3-6.4 6.3Z"/>
</g>
</symbol><symbol id="01_bottom_nav__projects_clipboard" viewBox="0 0 24 24">
<rect x="6.5" y="5.5" width="11" height="15" rx="2.2"/>
<rect x="9" y="3.5" width="6" height="4" rx="1.4"/>
<path d="M9.5 11h5M9.5 14.5h5M9.5 18h3.2"/>
</symbol><symbol id="01_bottom_nav__settings_gear" viewBox="0 0 24 24">
<path d="M 12.000 5.400 L 13.600 3.958 L 15.138 4.424 L 15.667 6.512 L 16.667 7.333 L 18.818 7.444 L 19.576 8.862 L 18.473 10.712 L 18.600 12.000 L 20.042 13.600 L 19.576 15.138 L 17.488 15.667 L 16.667 16.667 L 16.556 18.818 L 15.138 19.576 L 13.288 18.473 L 12.000 18.600 L 10.400 20.042 L 8.862 19.576 L 8.333 17.488 L 7.333 16.667 L 5.182 16.556 L 4.424 15.138 L 5.527 13.288 L 5.400 12.000 L 3.958 10.400 L 4.424 8.862 L 6.512 8.333 L 7.333 7.333 L 7.444 5.182 L 8.862 4.424 L 10.712 5.527 Z"/>
<circle cx="12" cy="12" r="3.0"/>
</symbol><symbol id="01_bottom_nav__sync_cloud_upload" viewBox="0 0 24 24">
<g transform="translate(0.4219 -1.2422)">
<path d="M7.5 18.5H6.4A3.9 3.9 0 1 1 7.2 10.8 5.1 5.1 0 0 1 17 9.8a4 4 0 0 1 .6 7.9H16.5"/>
<path d="M12 20V13"/>
<path d="m9.5 15.5 2.5-2.5 2.5 2.5"/>
</g>
</symbol><symbol id="02_global_actions__add" viewBox="0 0 24 24">
<path d="M12 5v14M5 12h14"/>
</symbol><symbol id="02_global_actions__back" viewBox="0 0 24 24">
<g transform="translate(1.0078 0.0000)">
<path d="m14.5 5-7 7 7 7"/>
</g>
</symbol><symbol id="02_global_actions__chevron_right" viewBox="0 0 24 24">
<g transform="translate(-0.4922 0.0000)">
<path d="m9 5 7 7-7 7"/>
</g>
</symbol><symbol id="02_global_actions__close" viewBox="0 0 24 24">
<path d="m7 7 10 10M17 7 7 17"/>
</symbol><symbol id="02_global_actions__delete_bin" viewBox="0 0 24 24">
<path d="M4 7h16M10 4h4M9 7v12M12 7v12M15 7v12M6 7l1 13h10l1-13"/>
</symbol><symbol id="02_global_actions__dropdown" viewBox="0 0 24 24">
<path d="m7 9.5 5 5 5-5"/>
</symbol><symbol id="02_global_actions__filter" viewBox="0 0 24 24">
<path d="M4 6h16M7 12h10M10 18h4"/>
</symbol><symbol id="02_global_actions__gps_target" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="6"/>
<circle cx="12" cy="12" r="2"/>
<path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4"/>
</symbol><symbol id="02_global_actions__notification_bell" viewBox="0 0 24 24">
<g transform="translate(0.0000 -0.4219)">
<path d="M6.8 9.8A5.2 5.2 0 0 1 12 4.6a5.2 5.2 0 0 1 5.2 5.2v3.8l1.6 2.2H5.2l1.6-2.2V9.8Z"/>
<path d="M10 19a2.2 2.2 0 0 0 4 0"/>
</g>
</symbol><symbol id="02_global_actions__search" viewBox="0 0 24 24">
<g transform="translate(-0.1172 -0.1172)">
<circle cx="10.5" cy="10.5" r="5.8"/><path d="m14.8 14.8 4.7 4.7"/>
</g>
</symbol><symbol id="03_project_detail__customer" viewBox="0 0 24 24">
<g transform="translate(0.0000 -0.4922)">
<circle cx="12" cy="8" r="3"/>
<path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>
</g>
</symbol><symbol id="03_project_detail__district_pin" viewBox="0 0 24 24">
<g transform="translate(0.0000 -0.7031)">
<path d="M12 20.5s5.5-5 5.5-10.1a5.5 5.5 0 1 0-11 0c0 5.1 5.5 10.1 5.5 10.1Z"/>
<circle cx="12" cy="10.3" r="1.9"/>
</g>
</symbol><symbol id="03_project_detail__environment_camera" viewBox="0 0 24 24">
<g transform="translate(0.0000 0.5156)">
<rect x="4" y="6.5" width="16" height="12" rx="2.2"/>
<path d="M8 6.5 9.4 4.5h5.2L16 6.5"/>
<circle cx="12" cy="12.5" r="3"/>
</g>
</symbol><symbol id="03_project_detail__export_pdf" viewBox="0 0 24 24">
<g transform="translate(-0.7500 0.1172)">
<path d="M7 3.8h7.5l3.5 3.5V20H7z"/>
<path d="M14.5 3.8v4h4"/>
<path d="M9.5 11h5"/>
<path d="M12 13.5v4"/>
<path d="m10 15.8 2 2 2-2"/>
</g>
</symbol><symbol id="03_project_detail__photo_selected" viewBox="0 0 24 24">
<rect x="4" y="5.5" width="16" height="13" rx="2.2"/>
<path d="m8 12 2.2 2.2L16 8.8"/>
</symbol><symbol id="03_project_detail__project_info" viewBox="0 0 24 24">
<g transform="translate(-0.7500 0.1172)">
<path d="M7 3.8h7.5l3.5 3.5V20H7z"/>
<path d="M14.5 3.8v4h4"/>
<path d="M9.5 11h5M9.5 14.5h5M9.5 18h3.2"/>
</g>
</symbol><symbol id="03_project_detail__status_quote" viewBox="0 0 24 24">
<g transform="translate(-0.7500 0.0000)">
<rect x="6.5" y="4" width="11" height="16" rx="2"/>
<path d="M9 8.5h6M9 12h6M9 15.5h4"/>
<circle cx="16.5" cy="16.5" r="2.5"/>
</g>
</symbol><symbol id="03_project_detail__tree_count" viewBox="0 0 24 24">
<g transform="translate(0.1172 0.3047)">
<path d="M12 20v-6"/>
<path d="M9.3 14.5H7.7A4.2 4.2 0 0 1 7.2 6.2 5.2 5.2 0 0 1 17 8.2a3.8 3.8 0 0 1-.7 7.5h-1.6"/>
<path d="M9.5 20h5"/>
</g>
</symbol><symbol id="03_project_detail__tree_detail" viewBox="0 0 24 24">
<g transform="translate(0.0469 0.3047)">
<path d="M12 20v-6"/>
<path d="M9.5 14.6H7.8a4.2 4.2 0 0 1-.5-8.3A5.1 5.1 0 0 1 17 8.2a3.9 3.9 0 0 1-.7 7.6h-1.8"/>
<path d="M9.4 20h5.2"/>
<circle cx="17.8" cy="17.8" r="2.2"/>
<path d="M17.8 16.8v2M16.8 17.8h2"/>
</g>
</symbol><symbol id="03_project_detail__tree_list" viewBox="0 0 24 24">
<g transform="translate(-0.4453 -1.1484)">
<path d="M8.8 16H7.5a4 4 0 0 1-.4-7.9A5 5 0 0 1 16.6 10a3.7 3.7 0 0 1-1 6"/>
<path d="M11 13v8M8.7 21h4.6"/>
<path d="M16.5 15.5H21M16.5 18.5H21"/>
</g>
</symbol><symbol id="04_form_fields__calendar" viewBox="0 0 24 24">
<g transform="translate(0.0000 0.4922)">
<rect x="4.5" y="6" width="15" height="13.5" rx="2"/>
<path d="M8 3.5V8M16 3.5V8M4.5 9.5h15"/>
</g>
</symbol><symbol id="04_form_fields__location" viewBox="0 0 24 24">
<g transform="translate(0.0000 -0.7031)">
<path d="M12 20.5s5.5-5 5.5-10.1a5.5 5.5 0 1 0-11 0c0 5.1 5.5 10.1 5.5 10.1Z"/>
<circle cx="12" cy="10.3" r="1.9"/>
</g>
</symbol><symbol id="04_form_fields__moon_night" viewBox="0 0 24 24">
<g transform="translate(-0.1641 0.1641)">
<path d="M18.2 15.8A7.4 7.4 0 0 1 8.2 5.8a6.5 6.5 0 1 0 10 10Z"/>
</g>
</symbol><symbol id="04_form_fields__note" viewBox="0 0 24 24">
<rect x="5" y="4" width="14" height="16" rx="2"/>
<path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5"/>
</symbol><symbol id="04_form_fields__phone" viewBox="0 0 24 24">
<g transform="translate(0.7969 0.6094)">
<path d="M7 4.3 4.8 5.8c-.6.4-.8 1.2-.6 1.8 1.9 5 5.8 8.9 10.8 10.8.6.2 1.4 0 1.8-.6l1.5-2.2-3.8-1.9-1.3 1.5a13 13 0 0 1-4.4-4.4l1.5-1.3L8.4 5.7 7 4.3Z"/>
</g>
</symbol><symbol id="04_form_fields__sun_day" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="3.2"/>
<path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/>
</symbol><symbol id="05_sync_status__failed" viewBox="0 0 24 24">
<g transform="translate(0.0000 0.4922)">
<path d="M12 4 3.5 19h17L12 4Z"/>
<path d="M12 9.5v4.5M12 16.8v.1"/>
</g>
</symbol><symbol id="05_sync_status__pending" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="8"/>
<path d="M12 7.5V12l3 2"/>
</symbol><symbol id="05_sync_status__synced" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="8"/>
<path d="m8.5 12 2.2 2.2 4.8-5"/>
</symbol><symbol id="05_sync_status__upload_now" viewBox="0 0 24 24">
<g transform="translate(0.4219 -1.2422)">
<path d="M7.5 18.5H6.4A3.9 3.9 0 1 1 7.2 10.8 5.1 5.1 0 0 1 17 9.8a4 4 0 0 1 .6 7.9H16.5"/>
<path d="M12 20V13"/><path d="m9.5 15.5 2.5-2.5 2.5 2.5"/>
</g>
</symbol><symbol id="06_settings_admin__diagnostics" viewBox="0 0 24 24">
<path d="M3 12h4l2-5 4 10 2-5h6"/>
</symbol><symbol id="06_settings_admin__info" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="8"/>
<path d="M12 10.5V17M12 7.4v.1"/>
</symbol><symbol id="06_settings_admin__lock" viewBox="0 0 24 24">
<rect x="5.5" y="10" width="13" height="10" rx="2"/>
<path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/>
</symbol><symbol id="06_settings_admin__logout" viewBox="0 0 24 24">
<g transform="translate(0.4922 0.0000)">
<path d="M10 5H5.5v14H10"/>
<path d="m13.5 8 4 4-4 4M9 12h8.5"/>
</g>
</symbol><symbol id="06_settings_admin__unit_price" viewBox="0 0 24 24">
<path d="M4.5 4.5h7l8 8-7 7-8-8v-7Z"/>
<circle cx="8" cy="8" r="1.2"/>
</symbol><symbol id="07_quote_status__quote_pending" viewBox="0 0 24 24">
<g transform="translate(-0.7500 0.0000)">
<path d="M7 4h7.5l3.5 3.5V20H7z"/>
<path d="M14.5 4v4h4"/>
<path d="M9.5 12h5M9.5 15.5h3.5"/>
</g>
</symbol><symbol id="07_quote_status__quoted" viewBox="0 0 24 24">
<g transform="translate(-0.7500 0.0000)">
<path d="M7 4h7.5l3.5 3.5V20H7z"/>
<path d="M14.5 4v4h4"/>
<path d="m9.5 14 2 2 3.8-4"/>
</g>
</symbol><symbol id="07_quote_status__won" viewBox="0 0 24 24">
<g transform="translate(0.0000 -0.2344)">
<path d="M8.5 4.5h7v4.8a3.5 3.5 0 0 1-7 0V4.5Z"/>
<path d="M8.5 6.5h-3V8a3.2 3.2 0 0 0 3.2 3.2M15.5 6.5h3V8a3.2 3.2 0 0 1-3.2 3.2"/>
<path d="M12 13v3.5M9 20h6M10 16.5h4V20"/>
</g>
</symbol><symbol id="08_management__customer_book" viewBox="0 0 24 24">
<rect x="5.2" y="3.8" width="13.6" height="16.4" rx="2"/>
<path d="M8 3.8v16.4"/>
<circle cx="13.3" cy="9" r="2.1"/>
<path d="M9.9 16a3.4 3.4 0 0 1 6.8 0"/>
</symbol><symbol id="08_management__unit_price" viewBox="0 0 24 24">
<path d="M4.5 4.5h7l8 8-7 7-8-8v-7Z"/>
<circle cx="8" cy="8" r="1.2"/>
<path d="M11 11.2h4.3M11 14.2h3"/>
</symbol><symbol id="09_pdf__pdf_document" viewBox="0 0 24 24">
<g transform="translate(-0.7500 0.1172)">
<path d="M7 3.8h7.5l3.5 3.5V20H7z"/>
<path d="M14.5 3.8v4h4"/>
<path d="M9.5 12h5M9.5 15h5"/>
</g>
</symbol><symbol id="09_pdf__photo_include" viewBox="0 0 24 24">
<g transform="translate(0.0000 -0.3984)">
<rect x="4" y="5.5" width="16" height="13" rx="2.2"/>
<circle cx="9" cy="9.5" r="1.3"/>
<path d="m6.5 16 3.5-3.5 2.7 2.4 2.1-2 2.7 3.1"/>
<circle cx="17.3" cy="16.8" r="2.5"/>
<path d="m16.2 16.8.8.8 1.5-1.7"/>
</g>
</symbol>`
