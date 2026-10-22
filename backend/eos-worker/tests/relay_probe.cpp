// Headless cross-host probe. All EOS state and packet handling stay in Rust.
#include "halo2-online-protocol-bridge/src/lib.rs.h"
#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
#include <stdexcept>
#include <thread>
#include <vector>
namespace eos=halo2::online_protocol_bridge;
int main(int argc,char **argv)try {
    if(argc!=2)throw std::runtime_error("Supply a private qualification directory");
    const std::filesystem::path root=argv[1];
    unsigned self{};std::string socket,key;
    {std::ifstream input(root/"admission");if(!(input>>self>>socket>>key)||self>1)throw std::runtime_error("Invalid probe admission");}
    const auto other=1-self;
    rust::Vec<eos::EosPeer> peers;peers.push_back({static_cast<std::uint8_t>(other),key});
    eos::EosSession session;session.enabled=true;session.playlist="halo2-wan-qualification";
    session.revision="eos-v1";session.map="lockout";session.variant="Slayer";
    const bool force=!std::getenv("H2_EOS_PROBE_ALLOW_DIRECT");
    auto transport=eos::new_eos_transport(self,std::move(peers),socket,force,std::move(session));
    std::vector<std::uint8_t> payload(1404);for(unsigned i=0;i<payload.size();++i)payload[i]=i%251;
    const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(90);
    unsigned received=0,sent=0;
    auto completed=until;
    while(std::chrono::steady_clock::now()<until){
        eos::eos_tick(*transport);
        for(auto &signal:eos::eos_signals(*transport)){
            std::ofstream output(root/"identity");output<<std::string(signal.user)<<'\n';
        }
        {std::ifstream input(root/"peer");std::string user;
            if(std::getline(input,user)&&user.size()==32)eos::eos_signal(*transport,other,user);}
        if(eos::eos_failed(*transport,other))throw std::runtime_error("EOS cross-host connection failed");
        if(eos::eos_ready(*transport,other)){
            if(force&&!eos::eos_relayed(*transport,other))throw std::runtime_error("Epic relay route was not established");
            sent+=eos::eos_send(*transport,other,{payload.data(),payload.size()});
        }
        for(auto packet=eos::eos_receive(*transport);packet.present;packet=eos::eos_receive(*transport)){
            if(packet.peer!=other||packet.data.size()!=payload.size()||!std::equal(packet.data.begin(),packet.data.end(),payload.begin()))
                throw std::runtime_error("Cross-host payload changed");
            ++received;
        }
        if(received>=100&&sent>=100&&completed==until)
            completed=std::chrono::steady_clock::now()+std::chrono::seconds(2);
        if(std::chrono::steady_clock::now()>=completed&&completed!=until){
            std::ofstream output(root/"result.json");output<<"{\"passed\":true,\"relayed\":"<<(eos::eos_relayed(*transport,other)?"true":"false")<<",\"sessions\":true,\"packet_bytes\":1404,\"received\":"<<received<<",\"sent\":"<<sent<<"}\n";
            return 0;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    throw std::runtime_error("EOS cross-host qualification timed out");
}catch(const std::exception &error){
    std::cerr<<"EOS cross-host qualification failed: "<<std::regex_replace(std::string(error.what()),std::regex("[A-Za-z0-9_+/=-]{24,}"),"[redacted]")<<'\n';return 1;
}
