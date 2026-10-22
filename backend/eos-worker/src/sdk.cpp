// Vendor ABI only. Rust owns the bounded RPC, configuration and trust checks.
#include "halo2-eos-worker/src/main.rs.h"
#include "src/sdk.hpp"
#include <eos_sdk.h>
#include <eos_stats.h>
#include <eos_leaderboards.h>
#include <eos_connect.h>
#include <eos_logging.h>
#include <algorithm>
#include <stdexcept>
#include <string>
#include <vector>
namespace halo2::eos {
using enum EOS_EResult;
static void check(EOS_EResult status){if(status!=EOS_Success)throw std::runtime_error(EOS_EResult_ToString(status));}
static std::string user_text(EOS_ProductUserId user){char text[EOS_PRODUCTUSERID_MAX_LENGTH+1]{};int32_t length=sizeof(text);check(EOS_ProductUserId_ToString(user,text,&length));return text;}
static EOS_ProductUserId user_id(rust::Str user){auto text=std::string(user);auto id=EOS_ProductUserId_FromString(text.c_str());if(!id)throw std::runtime_error("Invalid PUID");return id;}
struct Sdk::Impl {
  EOS_HPlatform platform{};EOS_HStats stats{};EOS_HLeaderboards boards{};EOS_HConnect connect{};
  bool initialized{};int32_t result=-1;Proof verified{};
  ~Impl(){if(platform)EOS_Platform_Release(platform);if(initialized)EOS_Shutdown();}
  void done(EOS_EResult status){if(EOS_EResult_IsOperationComplete(status))result=static_cast<int32_t>(status);}
};
Sdk::Sdk(const Config &config):impl_(std::make_unique<Impl>()){
  EOS_InitializeOptions init{};init.ApiVersion=EOS_INITIALIZE_API_LATEST;init.ProductName="H2Forever Web Services";init.ProductVersion="1";check(EOS_Initialize(&init));impl_->initialized=true;
  EOS_Logging_SetCallback([](const EOS_LogMessage*){});
  auto c=config;EOS_Platform_Options options{};options.ApiVersion=EOS_PLATFORM_OPTIONS_API_LATEST;
  options.ProductId=c.product.c_str();options.SandboxId=c.sandbox.c_str();options.DeploymentId=c.deployment.c_str();
  options.ClientCredentials.ClientId=c.client.c_str();options.ClientCredentials.ClientSecret=c.secret.c_str();
  options.CacheDirectory=c.cache.c_str();options.bIsServer=EOS_TRUE;options.Flags=EOS_PF_DISABLE_OVERLAY|EOS_PF_DISABLE_SOCIAL_OVERLAY;options.TickBudgetInMilliseconds=2;
  impl_->platform=EOS_Platform_Create(&options);if(!impl_->platform)throw std::runtime_error("EOS server platform unavailable");
  impl_->stats=EOS_Platform_GetStatsInterface(impl_->platform);impl_->boards=EOS_Platform_GetLeaderboardsInterface(impl_->platform);impl_->connect=EOS_Platform_GetConnectInterface(impl_->platform);
}
Sdk::~Sdk()=default;
void Sdk::publish(rust::Str user,rust::Slice<const Stat> values){
  std::vector<std::string> names;names.reserve(values.size());for(const auto &v:values)names.emplace_back(v.name);
  std::vector<EOS_Stats_IngestData> data;data.reserve(values.size());for(size_t i=0;i<values.size();++i){EOS_Stats_IngestData row{};row.ApiVersion=EOS_STATS_INGESTDATA_API_LATEST;row.StatName=names[i].c_str();row.IngestAmount=values[i].value;data.push_back(row);}
  EOS_Stats_IngestStatOptions options{};options.ApiVersion=EOS_STATS_INGESTSTAT_API_LATEST;options.TargetUserId=user_id(user);options.Stats=data.data();options.StatsCount=data.size();impl_->result=-1;
  EOS_Stats_IngestStat(impl_->stats,&options,impl_.get(),[](const EOS_Stats_IngestStatCompleteCallbackInfo *r){static_cast<Impl*>(r->ClientData)->done(r->ResultCode);});
}
void Sdk::query(rust::Str user,rust::Slice<const rust::String> names){
  std::vector<std::string> storage;storage.reserve(names.size());for(const auto &name:names)storage.emplace_back(name);
  std::vector<const char*> pointers;for(const auto &s:storage)pointers.push_back(s.c_str());
  EOS_Stats_QueryStatsOptions options{};options.ApiVersion=EOS_STATS_QUERYSTATS_API_LATEST;options.TargetUserId=user_id(user);
  options.StartTime=options.EndTime=EOS_STATS_TIME_UNDEFINED;options.StatNames=pointers.data();options.StatNamesCount=pointers.size();impl_->result=-1;
  EOS_Stats_QueryStats(impl_->stats,&options,impl_.get(),[](const EOS_Stats_OnQueryStatsCompleteCallbackInfo *r){static_cast<Impl*>(r->ClientData)->done(r->ResultCode);});
}
rust::Vec<Stat> Sdk::values(rust::Str user,rust::Slice<const rust::String> names)const{
  rust::Vec<Stat> result;for(const auto &name:names){const std::string text(name);EOS_Stats_CopyStatByNameOptions options{};options.ApiVersion=EOS_STATS_COPYSTATBYNAME_API_LATEST;options.TargetUserId=user_id(user);options.Name=text.c_str();EOS_Stats_Stat *value{};
    auto status=EOS_Stats_CopyStatByName(impl_->stats,&options,&value);if(status==EOS_NotFound)continue;check(status);
    std::unique_ptr<EOS_Stats_Stat,decltype(&EOS_Stats_Stat_Release)> owned(value,EOS_Stats_Stat_Release);Stat row{};row.name=text;row.value=value->Value;result.push_back(std::move(row));}return result;
}
void Sdk::leaderboard(rust::Str id){const std::string text(id);EOS_Leaderboards_QueryLeaderboardRanksOptions options{};options.ApiVersion=EOS_LEADERBOARDS_QUERYLEADERBOARDRANKS_API_LATEST;options.LeaderboardId=text.c_str();impl_->result=-1;
  EOS_Leaderboards_QueryLeaderboardRanks(impl_->boards,&options,impl_.get(),[](const EOS_Leaderboards_OnQueryLeaderboardRanksCompleteCallbackInfo *r){static_cast<Impl*>(r->ClientData)->done(r->ResultCode);});
}
rust::Vec<Record> Sdk::records()const{EOS_Leaderboards_GetLeaderboardRecordCountOptions count{};count.ApiVersion=EOS_LEADERBOARDS_GETLEADERBOARDRECORDCOUNT_API_LATEST;auto size=std::min(EOS_Leaderboards_GetLeaderboardRecordCount(impl_->boards,&count),uint32_t(1000));rust::Vec<Record> result;
  for(uint32_t i=0;i<size;++i){EOS_Leaderboards_CopyLeaderboardRecordByIndexOptions options{};options.ApiVersion=EOS_LEADERBOARDS_COPYLEADERBOARDRECORDBYINDEX_API_LATEST;options.LeaderboardRecordIndex=i;EOS_Leaderboards_LeaderboardRecord *value{};check(EOS_Leaderboards_CopyLeaderboardRecordByIndex(impl_->boards,&options,&value));
    std::unique_ptr<EOS_Leaderboards_LeaderboardRecord,decltype(&EOS_Leaderboards_LeaderboardRecord_Release)> owned(value,EOS_Leaderboards_LeaderboardRecord_Release);Record row{};row.user=user_text(value->UserId);row.rank=value->Rank;row.score=value->Score;result.push_back(std::move(row));}return result;
}
void Sdk::verify(rust::Str user,rust::Str token){const std::string text(token);EOS_Connect_IdToken id{};id.ApiVersion=EOS_CONNECT_IDTOKEN_API_LATEST;id.ProductUserId=user_id(user);id.JsonWebToken=text.c_str();EOS_Connect_VerifyIdTokenOptions options{};options.ApiVersion=EOS_CONNECT_VERIFYIDTOKEN_API_LATEST;options.IdToken=&id;impl_->result=-1;impl_->verified={};
  EOS_Connect_VerifyIdToken(impl_->connect,&options,impl_.get(),[](const EOS_Connect_VerifyIdTokenCallbackInfo *r){auto &self=*static_cast<Impl*>(r->ClientData);self.done(r->ResultCode);if(r->ResultCode!=EOS_Success)return;
    auto &v=self.verified;v.user=user_text(r->ProductUserId);v.account_info=r->bIsAccountInfoPresent;v.provider=v.account_info?int32_t(r->AccountIdType):-1;
    if(v.account_info&&r->AccountId)v.account=r->AccountId;
    if(r->ClientId)v.client=r->ClientId;
    if(r->ProductId)v.product=r->ProductId;
    if(r->SandboxId)v.sandbox=r->SandboxId;
    if(r->DeploymentId)v.deployment=r->DeploymentId;
  });
}
Proof Sdk::proof()const{return impl_->verified;}
int32_t Sdk::poll(){EOS_Platform_Tick(impl_->platform);return impl_->result;}
std::unique_ptr<Sdk> create(const Config &config){return std::make_unique<Sdk>(config);}
}
