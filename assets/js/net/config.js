/* ============================================================
   联机配置
   ------------------------------------------------------------
   supabaseUrl / supabaseKey 需要在 Supabase 项目创建后填写。
   只能填 publishable（sb_publishable_...）或 anon key，
   绝不可填写 service_role / secret key。
   ============================================================ */

window.CYB_NET_CONFIG = {
  /* 例：https://abcdefghijklmn.supabase.co */
  supabaseUrl: "",
  /* 例：sb_publishable_xxxxxxxxxxxxxxxx */
  supabaseKey: "",

  /* Netlib 用固定 UUID 即可，同一个站点所有游戏共用 */
  netlibGameId: "9f2c1d47-6b8e-4a03-9c55-2e7d81b4f0aa",
  /* 留空使用 Poki 默认信令；将来可切到自托管 */
  signalingUrl: "",

  /* 静态资源根路径，站点部署在域名根目录，保持 "/" */
  assetBase: "/",

  invites: {
    ttlSeconds: 30,       // 邀请有效期
    codeWaitSeconds: 20,  // 接受后等待房间码
    joinSeconds: 15,      // join 到 connected
    helloSilence: 8       // connected 后等首包
  },

  games: {
    gomoku: { name: "五子棋", href: "/games/gomoku/", maxPlayers: 2 }
  }
};
